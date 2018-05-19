
Requirements

* bluez for bluetooth plugin
* networkmanager for network plugin
* pulseaudio for audio plugin


To allow non-root users to change brightness (e.g. members of group wheel), in: /etc/udev/rules.d/backlight.rules:

ACTION=="add", SUBSYSTEM=="backlight", KERNEL=="acpi_video0", RUN+="/bin/chgrp wheel /sys/class/backlight/%k/brightness"
ACTION=="add", SUBSYSTEM=="backlight", KERNEL=="acpi_video0", RUN+="/bin/chmod g+w /sys/class/backlight/%k/brightness"