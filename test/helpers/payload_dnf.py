# Copyright (C) 2025 Red Hat, Inc.
#
# This program is free software; you can redistribute it and/or modify it
# under the terms of the GNU Lesser General Public License as published by
# the Free Software Foundation; either version 2.1 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# Lesser General Public License for more details.
#
# You should have received a copy of the GNU Lesser General Public License
# along with this program; If not, see <http://www.gnu.org/licenses/>.

import os
import sys

HELPERS_DIR = os.path.dirname(__file__)
sys.path.append(HELPERS_DIR)

from steps import SOFTWARE_SELECTION


class PayloadDNF():
    def __init__(self, browser):
        self.browser = browser
        self._step = SOFTWARE_SELECTION

    def check_selected_environment(self, environment):
        env_id = f"{self._step}-environment-{environment}"
        self.browser.wait_visible(f"#{env_id}.pf-m-selected")

    def select_environment(self, environment):
        env_id = f"{self._step}-environment-{environment}"
        self.browser.click(f"#{env_id}")
        self.browser.wait_visible(f"#{env_id}.pf-m-selected")

    def check_not_selected_group(self, group):
        """Check that the specified groups are not selected."""
        group_id = f"{self._step}-group-{group}"
        self.browser.wait_visible(f"#{group_id}:not(.pf-m-selected)")

    def check_group_selected(self, group):
        """Check if a specific group is selected."""
        group_id = f"{self._step}-group-{group}"
        self.browser.wait_visible(f"#{group_id}.pf-m-selected")

    def select_group(self, group):
        """Select a group by clicking on it."""
        group_id = f"{self._step}-group-{group}"
        self.browser.click(f"#{group_id}")
        self.check_group_selected(group)

    def deselect_group(self, group):
        """Deselect a group by clicking on it."""
        group_id = f"{self._step}-group-{group}"
        self.browser.click(f"#{group_id}")
        self.check_not_selected_group(group)

    def check_first_optional_group(self, group):
        """Check that a specific group is the first item in the optional groups menu."""
        optional_groups_id = f"{self._step}-optional-groups"
        group_id = f"{self._step}-group-{group}"
        # Check that the optional groups menu exists
        self.browser.wait_visible(f"#{optional_groups_id} li:first-of-type #{group_id}")

