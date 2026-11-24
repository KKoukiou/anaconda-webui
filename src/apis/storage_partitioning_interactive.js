/*
 * Copyright (C) 2026 Red Hat, Inc.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

/*
 * Guided partitioning on top of the interactive partitioning module.
 *
 * Unlike the automatic partitioning module, the interactive module has no
 * request property and its scheduling tasks modify the storage model in place.
 * The WebUI therefore keeps a plan for every interactive partitioning it creates:
 *
 *   - request:   the automatic partitioning request (a{sv} with variants) that is
 *                passed to SchedulePartitionsWithTask
 *   - actions:   the preparation steps run on the device tree before scheduling
 *                (clearing disks, removing or shrinking devices)
 *   - scheduled: whether the partitions were already scheduled for this
 *                partitioning, in which case scheduling again would allocate
 *                the layout twice
 *
 * Plans survive page reloads in the session storage.
 */
import cockpit from "cockpit";

import { getPartitioningDataAction } from "../actions/storage-actions.js";

import { _callClient } from "./helpers.js";

import {
    runStorageTaskAsync,
    StorageClient,
} from "./storage.js";

const INTERFACE_NAME_STORAGE = "org.fedoraproject.Anaconda.Modules.Storage";
const INTERFACE_NAME_PARTITIONING = "org.fedoraproject.Anaconda.Modules.Storage.Partitioning";
const OBJECT_PATH_STORAGE = "/org/fedoraproject/Anaconda/Modules/Storage";
const INTERFACE_NAME_SCHEDULER = "org.fedoraproject.Anaconda.Modules.Storage.DeviceTree.Scheduler";
const SESSION_STORAGE_KEY = "interactive-partitioning-plans";

const callScheduler = (deviceTree, ...args) => {
    return _callClient(StorageClient, deviceTree, INTERFACE_NAME_SCHEDULER, ...args);
};

const loadPlans = () => {
    try {
        return JSON.parse(window.sessionStorage.getItem(SESSION_STORAGE_KEY)) || {};
    } catch {
        return {};
    }
};

/**
 * @param {string} partitioning DBus path to a partitioning
 *
 * @returns {Object|undefined}  The plan of an interactive partitioning created by the WebUI
 */
export const getPartitioningPlan = (partitioning) => {
    return loadPlans()[partitioning];
};

/**
 * Store the plan and let the store know about the changed request.
 *
 * @param {string} partitioning DBus path to a partitioning
 * @param {Object} plan         The new plan
 */
export const setPartitioningPlan = (partitioning, plan) => {
    const plans = loadPlans();
    plans[partitioning] = plan;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(plans));

    const dispatch = new StorageClient().dispatch;
    dispatch?.(getPartitioningDataAction({ partitioning, requests: [plan.request] }));
};

const updatePartitioningPlan = (partitioning, changes) => {
    const plan = getPartitioningPlan(partitioning);

    if (!plan) {
        throw new Error(`No plan found for partitioning ${partitioning}`);
    }

    setPartitioningPlan(partitioning, { ...plan, ...changes });
};

/**
 * @param {string} deviceTree   DBus path to a device tree
 * @param {string} device       A device ID
 */
const destroyDevice = ({ device, deviceTree }) => {
    return callScheduler(deviceTree, "DestroyDevice", [device]);
};

/**
 * Resize an existing device through the device factory, the same way the
 * GTK custom partitioning spoke does it.
 *
 * @param {string} deviceTree   DBus path to a device tree
 * @param {string} device       A device ID
 * @param {number} size         The new size in bytes
 */
const resizeDevice = async ({ device, deviceTree, size }) => {
    const original = await callScheduler(deviceTree, "GenerateDeviceFactoryRequest", [device]);
    const request = { ...original, "device-size": cockpit.variant("t", size) };

    return callScheduler(deviceTree, "ChangeDevice", [request, original]);
};

const runPlanAction = ({ action, deviceTree }) => {
    switch (action.type) {
    case "clear-disk":
    case "remove":
        return destroyDevice({ device: action.device, deviceTree });
    case "shrink":
        return resizeDevice({ device: action.device, deviceTree, size: action.size });
    default:
        throw new Error(`Unknown partitioning plan action ${action.type}`);
    }
};

const getDeviceTreePath = ({ partitioning }) => {
    return _callClient(StorageClient, partitioning, INTERFACE_NAME_PARTITIONING, "GetDeviceTree", []);
};

/**
 * Run a preparation action on the device tree of a partitioning and remember
 * it in the plan, so that the partitioning can be recreated later.
 *
 * @param {string} partitioning DBus path to a partitioning
 * @param {Object} action       {type: "clear-disk"|"remove", device} or {type: "shrink", device, size}
 */
export const addPartitioningPlanAction = async ({ action, partitioning }) => {
    const deviceTree = await getDeviceTreePath({ partitioning });

    await runPlanAction({ action, deviceTree });

    const plan = getPartitioningPlan(partitioning);
    updatePartitioningPlan(partitioning, { actions: [...plan.actions, action] });
};

/**
 * @param {string} partitioning DBus path to a partitioning
 * @param {string} device       A device ID
 *
 * @returns {Promise<boolean>}  Whether the size of the device can be changed
 */
export const isDeviceResizable = async ({ device, partitioning }) => {
    const deviceTree = await getDeviceTreePath({ partitioning });

    try {
        const request = await callScheduler(deviceTree, "GenerateDeviceFactoryRequest", [device]);
        const permissions = await callScheduler(deviceTree, "GenerateDeviceFactoryPermissions", [request]);

        return permissions["device-size"].v;
    } catch {
        // The device factory does not support this kind of device.
        return false;
    }
};

/**
 * Create an interactive partitioning and prepare it for scheduling.
 *
 * @param {Object} request      An automatic partitioning request
 * @param {Array} actions       Preparation actions to run on the new device tree
 *
 * @returns {Promise<string>}   The DBus path to the partitioning
 */
export const createInteractivePartitioning = async ({ actions = [], request = {} }) => {
    const partitioning = await _callClient(
        StorageClient, OBJECT_PATH_STORAGE, INTERFACE_NAME_STORAGE, "CreatePartitioning", ["INTERACTIVE"]
    );

    setPartitioningPlan(partitioning, { actions: [], request, scheduled: false });

    for (const action of actions) {
        await addPartitioningPlanAction({ action, partitioning });
    }

    return partitioning;
};

/**
 * Schedule the partitions described by the plan of the partitioning.
 *
 * If the partitions were scheduled already, recreate the partitioning from
 * the plan instead, as the interactive module would allocate them again.
 *
 * @param {string} partitioning DBus path to a partitioning
 *
 * @returns {Promise<string>}   DBus path to the scheduled partitioning
 */
export const schedulePartitioningPlan = async ({ partitioning }) => {
    let plan = getPartitioningPlan(partitioning);

    if (!plan) {
        throw new Error(`No plan found for partitioning ${partitioning}`);
    }

    if (plan.scheduled) {
        partitioning = await createInteractivePartitioning(plan);
        plan = getPartitioningPlan(partitioning);
    }

    const deviceTree = await getDeviceTreePath({ partitioning });
    const task = await callScheduler(
        deviceTree,
        "SchedulePartitionsWithTask",
        [plan.request]
    );
    await runStorageTaskAsync({ task });

    updatePartitioningPlan(partitioning, { scheduled: true });

    return partitioning;
};
