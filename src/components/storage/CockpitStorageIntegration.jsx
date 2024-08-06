/*
 * Copyright (C) 2024 Red Hat, Inc.
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
    HelperTextItem,
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

import React, { useContext, useEffect, useMemo, useState } from "react";
import {
    ActionList,
    Alert,
    Button,
    Card,
    CardBody,
    Divider,
    Flex,
    FlexItem,
    HelperText,
    HelperTextItem,
    List,
    ListItem,
    Modal,
    ModalVariant,
    PageSection,
    Stack,
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
    unlockDevice,
} from "../../apis/storage_devicetree.js";
import {
    setInitializationMode,
} from "../../apis/storage_disk_initialization.js";
import {
    applyStorage,
    createPartitioning,
    gatherRequests,
    setManualPartitioningRequests
} from "../../apis/storage_partitioning.js";

import { getDevicesAction, setStorageScenarioAction } from "../../actions/storage-actions.js";

import { getDeviceByName, getDeviceByPath } from "../../helpers/storage.js";

import { EmptyStatePanel } from "cockpit-components-empty-state";

import { StorageContext } from "../Common.jsx";
import {
    useDiskFreeSpace,
    useDiskTotalSpace,
    useMountPointConstraints,
    useOriginalDevices,
    useRequiredSize,
} from "./Common.jsx";
import { checkConfiguredStorage, checkUseFreeSpace } from "./InstallationScenario.jsx";

import "./CockpitStorageIntegration.scss";

const _ = cockpit.gettext;
const idPrefix = "cockpit-storage-integration";

const ReturnToInstallationButton = ({ onAction }) => (
    <Button
      icon={<ArrowLeftIcon />}
      id={idPrefix + "-return-to-installation-button"}
      variant="secondary"
      onClick={onAction}>
        {_("Return to installation")}
    </Button>
);

export const useMaybeBackdrop = () => {
    const [hasDialogOpen, setHasDialogOpen] = useState(false);

    useEffect(() => {
        const handleStorageEvent = (event) => {
            if (event.key === "cockpit_has_modal") {
                setHasDialogOpen(event.newValue === "true");
            }
        };

        window.addEventListener("storage", handleStorageEvent);

        return () => window.removeEventListener("storage", handleStorageEvent);
    }, []);

    return hasDialogOpen ? "cockpit-has-modal" : "";
};

const CockpitStorageConfirmationModal = ({ handleCancelOpenModal, handleConfirmOpenModal, showConfirmation }) => {
    return (
        <Modal
          isOpen={showConfirmation}
          onClose={handleCancelOpenModal}
          title={_("Modify storage")}
          titleIconVariant="warning"
          variant="small"
          actions={[
              <Button
                id={idPrefix + "-enter-storage-confirm"}
                key="confirm"
                variant="warning"
                onClick={handleConfirmOpenModal}>
                  {_("Launch storage editor")}
              </Button>,
              <Button
                id={idPrefix + "-enter-storage-cancel"}
                key="cancel"
                variant="link"
                onClick={handleCancelOpenModal}>
                  {_("Cancel")}
              </Button>
          ]}
        >
            <TextContent>
                <Text>
                    {_("The storage editor lets you resize, delete, and create partitions. " +
                        "It can set up LVM and much more. " +
                        "It is meant to be used as an advanced utility and not intended to be used in a typical installation.")}
                </Text>
                <Text component="strong">
                    {_("All changes made in the storage editor take effect immediately.")}
                </Text>
            </TextContent>
        </Modal>
    );
};

export const CockpitStorageIntegration = ({
    dispatch,
    isFormDisabled,
    onCritFail,
    scenarioAvailability,
    setShowStorage,
}) => {
    const [showDialog, setShowDialog] = useState(false);
    const [isConfirmed, setIsConfirmed] = useState(false);
    const backdropClass = useMaybeBackdrop();

    useEffect(() => {
        const iframe = document.getElementById("cockpit-storage-frame");
        if (iframe) {
            iframe.contentWindow.addEventListener("error", exception => {
                onCritFail({ context: _("Storage plugin failed"), isFrontend: true })(exception.error);
            });
        }
    }, [onCritFail]);

    const handleConfirmOpenModal = () => {
        setIsConfirmed(true);
        setShowStorage(true);
    };

    const handleCancelOpenModal = () => {
        setShowStorage(false);
        setIsConfirmed(false);
    };

    return (
        <>
            <CockpitStorageConfirmationModal
              handleCancelOpenModal={handleCancelOpenModal}
              handleConfirmOpenModal={handleConfirmOpenModal}
              showConfirmation={!isConfirmed}
            />
            <Modal
              aria-label={_("Configure storage")}
              className={backdropClass + " " + idPrefix + "-modal-page-section"}
              footer={<ReturnToInstallationButton onAction={() => setShowDialog(true)} />}
              hasNoBodyWrapper
              isOpen={isConfirmed}
              onClose={() => setShowDialog(true)}
              showClose={false}
              variant={ModalVariant.large}>
                <Alert
                  isInline
                  title={_("Changes made here will immediately affect the system. There is no 'undo'.")}
                  variant="warning"
                />
                <Divider />
                <div className={idPrefix + "-page-section-cockpit-storage"}>
                    <PageSection>
                        <iframe
                          src="/cockpit/@localhost/storage/index.html"
                          name="cockpit-storage"
                          id="cockpit-storage-frame"
                          className={idPrefix + "-iframe-cockpit-storage"} />
                    </PageSection>
                    <ModifyStorageSideBar />
                </div>
                {showDialog &&
                    <CheckStorageDialog
                      dispatch={dispatch}
                      isFormDisabled={isFormDisabled}
                      onCritFail={onCritFail}
                      scenarioAvailability={scenarioAvailability}
                      setShowDialog={setShowDialog}
                      setShowStorage={setShowStorage}
                    />}
            </Modal>
        </>
    );
};

export const preparePartitioning = async ({ devices, newMountPoints }) => {
    try {
        await setBootloaderDrive({ drive: "" });

        const partitioning = await createPartitioning({ method: "MANUAL" });
        const requests = await gatherRequests({ partitioning });

        const addRequest = (device, object, isSubVolume = false) => {
            const { content, dir, subvolumes, type } = object;
            let deviceSpec;
            if (!isSubVolume) {
                deviceSpec = getDeviceByPath(devices, device);
            } else {
                deviceSpec = getDeviceByName(devices, device);
            }

            if (!deviceSpec) {
                return;
            }

            if (deviceSpec && (dir || type === "swap")) {
                const existingRequestIndex = (
                    requests.findIndex(request => request["device-spec"].v === deviceSpec)
                );

                if (existingRequestIndex !== -1) {
                    requests[existingRequestIndex] = {
                        ...requests[existingRequestIndex],
                        "device-spec": cockpit.variant("s", deviceSpec),
                        "mount-point": cockpit.variant("s", dir || type),
                    };
                } else {
                    requests.push({
                        "device-spec": cockpit.variant("s", deviceSpec),
                        "mount-point": cockpit.variant("s", dir || type),
                    });
                }
            } else if (subvolumes) {
                Object.keys(subvolumes).forEach(subvolume => addRequest(subvolume, subvolumes[subvolume], true));
            } else if (type === "crypto") {
                const clearTextDevice = devices[deviceSpec].children.v[0];
                const clearTextDevicePath = devices[clearTextDevice].path.v;

                addRequest(clearTextDevicePath, content);
            }
        };

        Object.keys(newMountPoints).forEach(usedDevice => {
            addRequest(usedDevice, newMountPoints[usedDevice]);
        });

        await setManualPartitioningRequests({ partitioning, requests });
        return partitioning;
    } catch (error) {
        console.error("Failed to prepare partitioning", error);
    }
};

const CheckStorageDialog = ({
    dispatch,
    isFormDisabled,
    onCritFail,
    setShowDialog,
    setShowStorage,
}) => {
    const { diskSelection } = useContext(StorageContext);
    const devices = useOriginalDevices();
    const selectedDisks = diskSelection.selectedDisks;

    const [error, setError] = useState();
    const [checkStep, setCheckStep] = useState("rescan");
    const diskTotalSpace = useDiskTotalSpace({ devices, selectedDisks });
    const diskFreeSpace = useDiskFreeSpace({ devices, selectedDisks });
    const mountPointConstraints = useMountPointConstraints();
    const requiredSize = useRequiredSize();

    const newMountPoints = useMemo(() => JSON.parse(window.sessionStorage.getItem("cockpit_mount_points") || "{}"), []);
    const cockpitPassphrases = useMemo(() => JSON.parse(window.sessionStorage.getItem("cockpit_passphrases") || "{}"), []);

    const useConfiguredStorage = useMemo(() => {
        const availability = checkConfiguredStorage({
            devices,
            mountPointConstraints,
            newMountPoints,
            selectedDisks,
        });
        return availability.available;
    }, [
        devices,
        mountPointConstraints,
        newMountPoints,
        selectedDisks,
    ]);

    const useConfiguredStorageReview = useMemo(() => {
        const availability = checkConfiguredStorage({
            devices,
            mountPointConstraints,
            newMountPoints,
            selectedDisks,
        });

        return availability.review;
    }, [
        devices,
        mountPointConstraints,
        newMountPoints,
        selectedDisks,
    ]);

    const useFreeSpace = useMemo(() => {
        const availability = checkUseFreeSpace({
            diskFreeSpace,
            diskTotalSpace,
            requiredSize,
            selectedDisks,
        });

        return availability.available && !availability.hidden;
    }, [diskFreeSpace, diskTotalSpace, requiredSize, selectedDisks]);

    const loading = !error && checkStep !== undefined;
    const storageRequirementsNotMet = !loading && (error || (!useConfiguredStorage && !useFreeSpace));

    useEffect(() => {
        const mode = useConfiguredStorage ? "use-configured-storage" : "use-free-space";

        dispatch(setStorageScenarioAction(mode));

        if (!useConfiguredStorage && checkStep === "prepare-partitioning") {
            setCheckStep();
        }
    }, [useConfiguredStorage, checkStep, dispatch]);

    useEffect(() => {
        if (checkStep !== "luks") {
            return;
        }

        const devicesToUnlock = (
            Object.keys(cockpitPassphrases)
                    .map(dev => {
                        let device = getDeviceByName(devices, dev);
                        if (!device) {
                            device = getDeviceByPath(devices, dev);
                        }

                        return ({
                            device,
                            passphrase: cockpitPassphrases[dev]
                        });
                    }))
                .filter(({ device }) => {
                    return (
                        devices[device].formatData.type.v === "luks" &&
                            devices[device].formatData.attrs.v.has_key !== "True"
                    );
                });

        if (devicesToUnlock.some(dev => !dev.passphrase)) {
            onCritFail()({ message: _("Cockpit storage did not provide the passphrase to unlock encrypted device.") });
        }

        if (devicesToUnlock.length === 0) {
            setCheckStep("prepare-partitioning");
            return;
        }

        Promise.all(devicesToUnlock.map(unlockDevice))
                .catch(exc => {
                    setCheckStep();
                    setError(exc);
                })
                .then(() => {
                    dispatch(getDevicesAction());
                });
    }, [dispatch, checkStep, cockpitPassphrases, newMountPoints, devices, onCritFail, setError]);

    useEffect(() => {
        // If the required devices needed for manual partitioning are set up,
        // and prepare the partitioning
        if (checkStep !== "prepare-partitioning") {
            return;
        }

        const applyNewPartitioning = async () => {
            // CLEAR_PARTITIONS_NONE = 0
            try {
                await setInitializationMode({ mode: 0 });
                const partitioning = await preparePartitioning({ devices, newMountPoints });

                applyStorage({
                    onFail: exc => {
                        setCheckStep();
                        setError(exc);
                    },
                    onSuccess: () => setCheckStep(),
                    partitioning,
                });
            } catch (exc) {
                setCheckStep();
                setError(exc);
            }
        };

        applyNewPartitioning();
    }, [devices, checkStep, newMountPoints, useConfiguredStorage]);

    useEffect(() => {
        if (checkStep !== "rescan" || useConfiguredStorage === undefined) {
            return;
        }

        // When the dialog is shown rescan to get latest configured storage
        // and check if we need to prepare manual partitioning
        scanDevicesWithTask()
                .then(task => {
                    return runStorageTask({
                        onFail: exc => {
                            setCheckStep();
                            setError(exc);
                        },
                        onSuccess: () => dispatch(getDevicesAction())
                                .then(() => {
                                    setCheckStep("luks");
                                })
                                .catch(exc => {
                                    setCheckStep();
                                    setError(exc);
                                }),
                        task
                    });
                });
    }, [useConfiguredStorage, checkStep, dispatch, setError]);

    const goBackToInstallation = () => {
        setShowStorage(false);
    };

    const loadingDescription = (
        <EmptyStatePanel
          loading
          title={_("Checking storage configuration")}
          paragraph={_("This will take a few moments")} />
    );

    const modalProps = {};
    if (!loading) {
        if (storageRequirementsNotMet) {
            modalProps.title = _("Storage requirements not met");
        } else {
            modalProps.title = _("Continue with installation");
        }
    } else {
        modalProps["aria-label"] = _("Checking storage configuration");
    }

    return (
        <Modal
          className={idPrefix + "-check-storage-dialog" + (loading ? "--loading" : "")}
          id={idPrefix + "-check-storage-dialog"}
          onClose={() => setShowDialog(false)}
          titleIconVariant={!loading && storageRequirementsNotMet && "warning"}
          position="top" variant="small" isOpen
          {...modalProps}
          footer={
              !loading &&
              <>
                  <ActionList>
                      {!storageRequirementsNotMet &&
                          <>
                              <Button
                                id={idPrefix + "-check-storage-dialog-continue"}
                                isDisabled={isFormDisabled}
                                variant="primary"
                                onClick={goBackToInstallation}>
                                  {_("Continue")}
                              </Button>
                              <Button
                                id={idPrefix + "-check-storage-dialog-return"}
                                variant="link"
                                onClick={() => setShowDialog(false)}>
                                  {_("Return to storage editor")}
                              </Button>
                          </>}
                      {storageRequirementsNotMet &&
                          <>
                              <Button
                                variant="warning"
                                id={idPrefix + "-check-storage-dialog-return"}
                                onClick={() => setShowDialog(false)}>
                                  {_("Configure storage again")}
                              </Button>
                              <Button
                                id={idPrefix + "-check-storage-dialog-continue"}
                                isDisabled={isFormDisabled}
                                variant="secondary"
                                onClick={() => setShowStorage(false)}>
                                  {_("Proceed with installation")}
                              </Button>
                          </>}
                  </ActionList>
              </>
          }
        >
            <>
                {loading && loadingDescription}
                {!loading &&
                <>
                    {storageRequirementsNotMet ? error?.message : null}
                    <HelperText>
                        {!storageRequirementsNotMet &&
                        <HelperTextItem variant="success" isDynamic>
                            {useConfiguredStorage
                                ? (
                                    <Stack hasGutter>
                                        <span>{_("Detected valid storage layout:")}</span>
                                        {useConfiguredStorageReview}
                                    </Stack>
                                )
                                : _("Free space requirements met")}
                        </HelperTextItem>}
                    </HelperText>
                </>}
            </>
        </Modal>

    );
};

const ModifyStorageSideBar = () => {
    const mountPointConstraints = useMountPointConstraints();
    const requiredSize = useRequiredSize();

    if (mountPointConstraints === undefined) {
        return null;
    }

    const requiredConstraints = (
        mountPointConstraints.filter(constraint => constraint.required.v)
    );
    const recommendedConstraints = (
        mountPointConstraints.filter(constraint => !constraint.required.v && constraint.recommended.v)
    );
    const getConstraints = constraints => (
        <List className={idPrefix + "-requirements-hint-list"}>
            {constraints.map(constraint => {
                const item = [
                    constraint["mount-point"].v,
                    constraint["required-filesystem-type"].v
                ]
                        .filter(c => !!c)
                        .join(" ");

                return <ListItem key={item}>{item}</ListItem>;
            })}
        </List>
    );

    const requiredConstraintsSection = (
        requiredConstraints.length > 0 &&
        <>
            <Text component="p" className={idPrefix + "-requirements-hint"}>
                {_("If you are configuring partitions the following are required:")}
            </Text>
            {getConstraints(requiredConstraints)}
        </>
    );
    const recommendedConstraintsSection = (
        recommendedConstraints.length > 0 &&
        <>
            <Text component="p" className={idPrefix + "-requirements-hint"}>
                {_("Recommended partitions:")}
            </Text>
            {getConstraints(recommendedConstraints)}
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
                                {requiredConstraintsSection}
                                {recommendedConstraintsSection}
                            </TextContent>
                        </FlexItem>
                    </Flex>
                </CardBody>
            </Card>
        </PageSection>
    );
};
