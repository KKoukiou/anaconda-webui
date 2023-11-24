/*
 * Copyright (C) 2024 Red Hat, Inc.
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with This program; If not, see <http://www.gnu.org/licenses/>.
 */
import cockpit from "cockpit";
import React, { useEffect, useState } from "react";

import {
    ActionList,
    Alert,
    Button,
    Card,
    CardBody,
    Flex,
    FlexItem,
    List,
    ListItem,
    Modal,
    PageSection,
    PageSectionVariants,
    Spinner,
    Text,
    TextContent,
    Title,
} from "@patternfly/react-core";
import { ArrowLeftIcon } from "@patternfly/react-icons";

import {
    runStorageTask,
    scanDevicesWithTask,
} from "../../apis/storage.js";
import {
    setBootloaderDrive,
} from "../../apis/storage_bootloader.js";
import {
    applyStorage,
    createPartitioning,
    setManualPartitioningRequests
} from "../../apis/storage_partitioning.js";

import { getDevicesAction, getDiskSelectionAction } from "../../actions/storage-actions.js";
import { requestsToDbus } from "../../helpers/storage.js";

import "./CockpitStorageIntegration.scss";

const _ = cockpit.gettext;
const idPrefix = "cockpit-storage-integration";

export const CockpitStorageIntegration = ({
    deviceData,
    selectedDisks,
    dispatch,
    mountPointConstraints,
    onCritFail,
    requiredSize,
    scenarioAvailability,
    setShowStorage,
    setStorageScenarioId,
}) => {
    const [showDialog, setShowDialog] = useState(false);
    const [error, setError] = useState();

    return (
        <>
            <PageSection stickyOnBreakpoint={{ default: "top" }} variant={PageSectionVariants.light}>
                <Flex spaceItems={{ default: "spaceItemsLg" }}>
                    <Title headingLevel="h1" size="2xl">{_("Configure storage")}</Title>
                    <Alert variant="warning" isInline isPlain title={_("Changes made here will immediately affect the system. There is not undo.")} />
                </Flex>
            </PageSection>
            {error &&
            <PageSection className={idPrefix + "-page-section-storage-alert"}>
                <Alert variant="danger" isInline title={error} onClose={() => setError(undefined)} />
            </PageSection>}
            <div className={idPrefix + "-page-section-cockpit-storage"}>
                <iframe
                  src="/cockpit/@localhost/storage/index.html"
                  className={idPrefix + "-iframe-cockpit-storage"} />
                <ModifyStorageSideBar mountPointConstraints={mountPointConstraints} requiredSize={requiredSize} />
            </div>
            <PageSection className={idPrefix + "-page-section-storage-footer"} stickyOnBreakpoint={{ default: "bottom" }} variant={PageSectionVariants.light}>
                <Button
                  variant="secondary"
                  icon={<ArrowLeftIcon />}
                  onClick={() => setShowDialog(true)}>
                    {_("Return to installation")}
                </Button>
            </PageSection>
            {showDialog &&
            <CheckStorageDialog
              dispatch={dispatch}
              setError={setError}
              requiredSize={requiredSize}
              scenarioAvailability={scenarioAvailability}
              setShowStorage={setShowStorage}
              setStorageScenarioId={setStorageScenarioId}
              setShowDialog={setShowDialog}
            />}
        </>
    );
};

const CheckStorageDialog = ({
    dispatch,
    setError,
    requiredSize,
    scenarioAvailability,
    setShowDialog,
    setShowStorage,
    setStorageScenarioId,
}) => {
    const [isRescanningDisks, setIsRescanningDisks] = useState();
    useEffect(() => {
        setIsRescanningDisks(true);

        scanDevicesWithTask()
                .then(task => {
                    return runStorageTask({
                        task,
                        onSuccess: () => Promise.all([
                            dispatch(getDevicesAction()),
                            dispatch(getDiskSelectionAction())
                        ])
                                .finally(() => {
                                    setIsRescanningDisks(false);
                                })
                                .catch(exc => setError(exc.message)),
                        onFail: exc => {
                            setIsRescanningDisks(false);
                            setError(exc.message);
                        }
                    });
                });
    }, [dispatch, setError]);

    const checkStorage = async (mode) => {
        let partitioning;
        setBootloaderDrive({ drive: "" })
                .then(() => createPartitioning({ method: "MANUAL" }))
                .then(part => {
                    partitioning = part;
                    const cockpitMountPoints = JSON.parse(window.localStorage.getItem("cockpit_mount_points"));
                    const requests = Object.keys(cockpitMountPoints).map(mountPoint => ({ "mount-point": mountPoint, "device-spec": cockpitMountPoints[mountPoint] }));

                    return setManualPartitioningRequests({
                        partitioning,
                        requests: requestsToDbus(requests)
                    });
                })
                .then(() => applyStorage({
                    partitioning,
                    onFail: exc => {
                        setShowDialog(false);
                        setError(exc.message);
                    },
                    onSuccess: () => {
                        setStorageScenarioId(mode);
                        setShowStorage(false);
                    },
                }));
    };

    let description;
    if (isRescanningDisks) {
        description = (
            <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
                <Spinner size="md" />
                <FlexItem>{_("Checking storage configuration. This will take a few moments")}</FlexItem>
            </Flex>
        );
    }

    const isAdvancedHidden = (
        isRescanningDisks ||
        !scenarioAvailability["use-configured-storage"].available
    );
    const useAdvancedButton = (
        <Button
          variant="secondary"
          onClick={() => checkStorage("use-configured-storage")}>
            {_("Use created partitions")}
        </Button>
    );

    const isFreeHidden = (
        isRescanningDisks ||
        !isAdvancedHidden ||
        !scenarioAvailability["use-free-space"].available
    );
    const useFreeButton = (
        <Button
          variant="primary"
          onClick={() => checkStorage("use-free-space")}>
            {_("Use free space")}
        </Button>
    );

    return (
        <Modal
          title={_("Return to the installation?")}
          id={idPrefix + "-check-storage-dialog"}
          position="top" variant="small" isOpen onClose={() => setShowDialog(false)}
          footer={
              <>
                  {isRescanningDisks && description}
                  <ActionList>
                      {!isFreeHidden && useFreeButton}
                      {!isAdvancedHidden && useAdvancedButton}
                      <Button
                        variant="link"
                        onClick={() => setShowDialog(false)}>
                          {_("Cancel")}
                      </Button>
                  </ActionList>
              </>
          }
        />

    );
};

const ModifyStorageSideBar = ({ mountPointConstraints, requiredSize }) => {
    const requiredMountPoints = (
        mountPointConstraints
                .filter(constraint => constraint.required.v)
                .map(constraint => constraint["mount-point"].v)
    );
    const recommendedMountPoints = (
        mountPointConstraints
                .filter(constraint => !constraint.required.v && constraint.recommended.v)
                .map(constraint => constraint["mount-point"].v)
    );
    const requiredMountPointsSection = (
        requiredMountPoints.length > 0 &&
        <>
            <Text component="p" className={idPrefix + "-requirements-hint"}>
                {_("If you are configuring partitions the following are required:")}
            </Text>
            <List className={idPrefix + "-requirements-hint-list"}>
                {requiredMountPoints.map(mountPoint => (
                    <ListItem key={mountPoint}>{mountPoint}</ListItem>
                ))}
            </List>
        </>
    );
    const recommendedMountPointsSection = (
        recommendedMountPoints.length > 0 &&
        <>
            <Text component="p" className={idPrefix + "-requirements-hint"}>
                {_("Recommended partitions:")}
            </Text>
            <List className={idPrefix + "-requirements-hint-list"}>
                {recommendedMountPoints.map(mountPoint => (
                    <ListItem key={mountPoint}>{mountPoint}</ListItem>
                ))}
            </List>
        </>
    );

    return (
        <PageSection className={idPrefix + "-sidebar"}>
            <Card>
                <CardBody>
                    <Flex direction={{ default: "column" }} spaceItems={{ default: "spaceItemsLg" }}>
                        <FlexItem>
                            <Title headingLevel="h3" size="lg">{_("Requirements")}</Title>
                            <TextContent>
                                <Text component="p" className={idPrefix + "-requirements-hint"}>
                                    {cockpit.format(_("Fedora linux requires at least $0 of disk space."), cockpit.format_bytes(requiredSize))}
                                </Text>
                                <Text component="p" className={idPrefix + "-requirements-hint-detail"}>
                                    {_("You can either free up enough space here and let the installer handle the rest or manually set up partitions.")}
                                </Text>
                            </TextContent>
                        </FlexItem>
                        <FlexItem>
                            <Title headingLevel="h3" size="lg">{_("Partitions (advanced)")}</Title>
                            <TextContent>
                                {requiredMountPointsSection}
                                {recommendedMountPointsSection}
                            </TextContent>
                        </FlexItem>
                    </Flex>
                </CardBody>
            </Card>
        </PageSection>
    );
};
