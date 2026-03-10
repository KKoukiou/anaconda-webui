.. This page is included from docs/installation-steps.rst. Content adapted from the
   Fedora Installation Guide (Installing Using Anaconda).

Create Account
--------------

The Create Account screen can be used to create and configure one normal (non-``root``) user account during the installation. Only one user account can be configured here; if you need more accounts, create them after the installation completes (for example, using the ``useradd`` command or a graphical user management tool).

.. note::
   Creating a normal user account is not required to finish the installation; however, it is highly recommended. If you do not create one, you will have to log in to the system as root directly, which is **not** recommended.

To configure a user account, fill out the **Full name** and **Username**. The username is used to log in from a command line; if you install a graphical environment, the login manager will typically show the full name.

Make sure that the option to require a password for the account is enabled, then enter a password and confirm it. As you enter the password, the installer may evaluate its strength and show suggestions if it considers the password weak.

The option to make the user an administrator gives that user administrative rights (for example by adding the user to the ``wheel`` group), allowing the use of ``sudo`` to perform tasks that normally require ``root``. This can be more convenient but also has security implications.

.. note::
   If you give administrator privileges to a user, ensure the account is protected by a strong password. See the Fedora Security Guide for guidelines on password security.

This screen can be hidden in some product configurations (e.g. Workstation) where user creation is handled after first boot.
