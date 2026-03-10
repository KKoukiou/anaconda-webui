.. This page is included from docs/installation-steps.rst. Content adapted from the
   Fedora Installation Guide (Installing Using Anaconda).

Date and time
-------------

The Date and time screen allows you to configure time and date-related settings for your system. This screen is automatically configured based on the settings you selected on the Welcome screen, but you can change your date, time and location settings before you begin the installation.

First, select your region using the control at the top of the screen. Then, select your city, or the city closest to your location in the same time zone. Selecting a specific location helps ensure that your time is always set correctly, including automatic time changes for daylight saving time if applicable.

You can also select a time zone relative to Greenwich Mean Time (GMT) without setting your location to a specific region; select ``Etc`` as your region for that.

.. note::
   The list of cities and regions comes from the Time Zone Database (tzdata), maintained by the Internet Assigned Numbers Authority (IANA). See the `IANA time zone database <https://www.iana.org/time-zones>`_ for more information.

The switch for **Network Time** can be used to enable or disable network time synchronization using the Network Time Protocol (NTP). Enabling this option will keep your system time correct as long as the system can access the internet. If you disable network time synchronization, you can set the current time and date manually.

After configuring your time and date settings, confirm to return to the next step.
