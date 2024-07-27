# Copyright (C) 2023 Red Hat, Inc.
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
import subprocess
import sys
import tempfile

# import Cockpit's machinery for test VMs and its browser test API
TEST_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.dirname(TEST_DIR)
BOTS_DIR = f'{ROOT_DIR}/bots'
sys.path.append(os.path.join(TEST_DIR, "common"))
sys.path.insert(0, os.path.join(TEST_DIR, "helpers"))
sys.path.append(os.path.join(os.path.dirname(TEST_DIR), "bots/machine"))

from language import Language
from machine_install import VirtInstallMachine
from progress import Progress
from storage import Storage
from testlib import MachineCase  # pylint: disable=import-error
from users import Users
from utils import add_public_key

pixel_tests_ignore = [".logo", "#betanag-icon"]


class VirtInstallMachineCase(MachineCase):
    efi = False
    disk_image = ""
    disk_size = 15
    MachineCase.machine_class = VirtInstallMachine

    @classmethod
    def setUpClass(cls):
        VirtInstallMachine.efi = cls.efi
        cls.ext_logging = bool(int(os.environ.get('EXTENDED_LOGGING', '0')))

    def setUp(self):
        # FIXME: running this in destructive tests fails because the SSH session closes before this is run
        if self.is_nondestructive():
            self.addCleanup(self.resetUsers)
            self.addCleanup(self.resetStorage)
            self.addCleanup(self.resetLanguage)

        super().setUp()

        # Add installation target disk
        backing_file = None if not self.disk_image else os.path.join(BOTS_DIR, f"./images/{self.disk_image}")
        self.add_disk(self.disk_size, backing_file)
        # Select the disk as boot device
        subprocess.check_call([
            "virt-xml", "-c", "qemu:///session",
            self.machine.label, "--edit", "--boot", "hd"
        ])

        m = self.machine
        b = self.browser
        s = Storage(b, m)
        s.dbus_scan_devices()

        self.resetLanguage()

        self.allow_journal_messages('.*cockpit.bridge-WARNING: Could not start ssh-agent.*')
        self.installation_finished = False

        if not self.is_nondestructive():
            # Assume destructive tests may reboot the machine and ignore errors related to that
            self.allow_browser_errors(".*client closed.*")
            self.allow_browser_errors(".*Server has closed the connection.*")

    def add_disk(self, size, backing_file=None):
        image = self._create_disk_image(size, backing_file=backing_file)
        subprocess.check_call([
            "virt-xml", "-c",  "qemu:///session", self.machine.label,
            "--update", "--add-device", "--disk", f"{image},format=qcow2"
        ])

        if self.is_nondestructive():
            self.addCleanup(self.rem_disk, image)

        return image

    def rem_disk(self, disk):
        subprocess.check_call([
            "virt-xml", "-c", "qemu:///session", self.machine.label,
                "--update", "--remove-device", "--disk", disk
        ])
        os.remove(disk)

    def _create_disk_image(self, size, image_path=None, backing_file=None):
        if not image_path:
            _, image_path = tempfile.mkstemp(suffix='.qcow2', prefix=f"disk-anaconda-{self.machine.label}", dir="/var/tmp")
        subprocess.check_call([
            "qemu-img", "create", "-f", "qcow2",
            *(["-o", f"backing_file={backing_file},backing_fmt=qcow2"] if backing_file else []),
            image_path,
            f"{size}G"
        ])
        return image_path

    def resetLanguage(self):
        m = self.machine
        b = self.browser
        lang = Language(b, m)
        lang.dbus_set_language("en_US.UTF-8")

    def resetUsers(self):
        m = self.machine
        b = self.browser
        users = Users(b, m)
        users.dbus_clear_users()

    def resetStorage(self):
        # Ensures that anaconda has the latest storage configuration data
        m = self.machine
        b = self.browser
        s = Storage(b, m)

        s.dbus_reset_partitioning()
        s.dbus_reset_selected_disks()
        # CLEAR_PARTITIONS_DEFAULT = -1
        s.dbus_set_initialization_mode(-1)
        s.dbus_scan_devices()

    def downloadLogs(self):
        if not self.ext_logging:
            return

        self.logs_dir = os.path.join('./test_logs', f'{self.__class__.__name__}.{self._testMethodName}')
        if not os.path.isdir(self.logs_dir):
            os.makedirs(self.logs_dir)

        self.machine.download('/tmp/anaconda.log', 'anaconda.log', self.logs_dir)
        self.machine.download('/tmp/packaging.log', 'packaging.log', self.logs_dir)
        self.machine.download('/tmp/storage.log', 'storage.log', self.logs_dir)
        self.machine.download('/tmp/dbus.log', 'dbus.log', self.logs_dir)
        self.machine.download('/tmp/syslog', 'syslog', self.logs_dir)
        try:
            self.machine.download('/tmp/anaconda-tb-*', '.', self.logs_dir)
        except subprocess.CalledProcessError:
            pass

    def handleReboot(self):
        """
        Method for rebooting into the installed system.

        Should be called when installation is finished. Performs necessary steps
        so the test can continue with checking installed system.
        """
        add_public_key(self.machine)
        self.downloadLogs()
        self.installation_finished = True
        p = Progress(self.browser)
        p.reboot()

        # The installed machine does not need to skip the nologin check
        os.environ["TEST_ALLOW_NOLOGIN"] = "false"
        self.addCleanup(lambda: os.environ["TEST_ALLOW_NOLOGIN"] == "true")
        self.machine.wait_reboot()

    def selectBootMenuEntry(self, entry):
        grub_cfg = """
        GRUB_DEFAULT=saved
        GRUB_TIMEOUT=0
        GRUB_HIDDEN_TIMEOUT=0
        GRUB_HIDDEN_TIMEOUT_QUIET=true
        """

        self.write_file("/etc/default/grub", grub_cfg)
        self.machine.execute(f"grub2-set-default {entry}")

    def tearDown(self):
        if not self.installation_finished:
            self.downloadLogs()
        super().tearDown()


def test_plan(_url):
    def decorator(func):
        return func
    return decorator
