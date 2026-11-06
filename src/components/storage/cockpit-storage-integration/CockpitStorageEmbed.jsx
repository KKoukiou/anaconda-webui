/*
 * Copyright (C) 2026 Red Hat, Inc.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import cockpit from "cockpit";

import React from "react";
import { ExclamationCircleIcon } from "@patternfly/react-icons";

import { EmptyStatePanel } from "cockpit-components-empty-state.jsx";
import { read_anaconda_session_storage } from "utils.tsx";

import client from "cockpit/pkg/storaged/client.js";
import { StoragePage } from "cockpit/pkg/storaged/pages.jsx";

const _ = cockpit.gettext;

let clientInitialized = false;

export class CockpitStorageEmbed extends React.Component {
    constructor() {
        super();
        this.state = { inited: false, slow_init: false, path: [] };
        this.on_client_changed = () => { if (!client.busy) this.setState({}); };
        this.on_navigate = () => { this.setState({ path: cockpit.location.path }) };
    }

    componentDidMount() {
        client.addEventListener("changed", this.on_client_changed);
        cockpit.addEventListener("locationchanged", this.on_navigate);

        client.anaconda = read_anaconda_session_storage();
        // Reset to overview when entering the storage page
        cockpit.location.go([]);

        if (clientInitialized) {
            client.update();
            this.setState({ inited: true });
        } else {
            client.init(() => {
                clientInitialized = true;
                this.setState({ inited: true });
            });
            window.setTimeout(() => { if (!this.state.inited) this.setState({ slow_init: true }); }, 1000);
        }
    }

    componentWillUnmount() {
        client.removeEventListener("changed", this.on_client_changed);
        cockpit.removeEventListener("locationchanged", this.on_navigate);
    }

    render() {
        const { inited, slow_init, path } = this.state;

        if (!inited) {
            if (slow_init)
                return <EmptyStatePanel loading title={_("Loading...")} />;
            else
                return null;
        }

        if (client.features === false || client.younger_than("2.6"))
            return <EmptyStatePanel icon={ExclamationCircleIcon} title={_("Storage can not be managed on this system.")} />;

        // TODO: Storaged uses cockpit.location for internal navigation (e.g. clicking a disk),
        // which conflicts with anaconda-webui's own routing. Cockpit-storaged needs to support
        // a location prefix or accept navigation as a prop for proper embedded operation.
        return <StoragePage location={path} plot_state={{}} />;
    }
}
