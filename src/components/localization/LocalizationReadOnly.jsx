/*
 * Copyright (C) 2025 Red Hat, Inc.
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

import React, { useContext, useEffect } from "react";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";

import { getLanguageDisplayName } from "../../helpers/language.js";

import { LanguageContext } from "../../contexts/Common.jsx";

import "./InstallationLanguage.scss";

const _ = cockpit.gettext;
const SCREEN_ID = "anaconda-screen-language";

export const LocalizationReadOnly = ({ setIsFormValid }) => {
    const { keyboardLayouts, language, languages, plannedXlayouts } = useContext(LanguageContext);

    // Mark form as valid when kickstarted so Next button is enabled
    useEffect(() => {
        setIsFormValid(true);
    }, [setIsFormValid]);

    const languageDisplayName = getLanguageDisplayName(language, languages);
    const keyboardDisplayValue = plannedXlayouts?.length > 0 ? plannedXlayouts.join(", ") : "";

    return (
        <Form isHorizontal>
            <FormGroup
              label={_("Language")}
            >
                <TextInput
                  id={SCREEN_ID + "-language-readonly"}
                  readOnlyVariant="plain"
                  value={languageDisplayName}
                />
            </FormGroup>

            {keyboardLayouts.length > 0 && (
                <FormGroup
                  fieldId={`${SCREEN_ID}-keyboard-layouts`}
                  label={_("Keyboard")}
                >
                    <TextInput
                      id={SCREEN_ID + "-keyboard-readonly"}
                      readOnlyVariant="plain"
                      value={keyboardDisplayValue}
                    />
                </FormGroup>
            )}
        </Form>
    );
};
