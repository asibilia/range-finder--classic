# Range Finder Classic

Range Finder Classic is a World of Warcraft (WoW) Classic addon designed for hunters. It provides a visual indicator for attack range, informing players whether they are in melee range, ranged (Auto Shot) range, or out of range of their target.

## Features

- **Dynamic Range Indication**: Displays different text and colors based on the player's range from the target.
- **Customizable Slots**: Allows setting custom action bar slots for Wing Clip and Auto Shot.
- **Lockable Frame**: The addon's frame can be locked or unlocked for movement.
- **Persistence Across Sessions**: Saves the lock/unlock state and action bar slots for Wing Clip and Auto Shot, retaining these settings across game sessions.
- **Configurable Display Modes**: Choose to always display the frame or only when targeting an enemy.

## Installation

1. Download the addon from the designated repository or addon website.
2. Extract the downloaded file into the `Interface/AddOns` folder of your WoW Classic directory.
3. Restart World of Warcraft or reload your UI.

## Usage

### Slash Commands

- `/rf frame lock`: Locks the addon frame to prevent moving.
- `/rf frame unlock`: Unlocks the addon frame to allow moving.
- `/rf wingclip [slot]`: Sets the action bar slot for Wing Clip (replace `[slot]` with the slot number).
- `/rf autoshot [slot]`: Sets the action bar slot for Auto Shot (replace `[slot]` with the slot number).
- `/rf show auto`: The addon frame will automatically show or hide based on target presence and range.
- `/rf show always`: The addon frame will always be displayed, regardless of targeting or range.

### Range Indication

- The addon frame shows "Melee", "Ranged Shot", "Out of Range", or "No Target" based on your distance to the target and targeting status.
- Colors change accordingly:
  - Yellow for Melee range.
  - Green for Auto Shot range.
  - Red for Out of Range.
  - Gray for No Target (when in "always" display mode).

## Configuration

- **Lock/Unlock Frame**: Use the slash commands to lock or unlock the frame for moving.
- **Set Action Slots**: Use the slash commands to configure the specific slots for Wing Clip and Auto Shot.
- **Display Mode**: Configure the frame to be always visible or to show/hide automatically with slash commands.

## Support

For bug reports, feature requests, or support, please visit [GitHub issues page](https://github.com/asibilia/range-finder--classic/issues) or contact the developer at [sibilia.alec@gmail.com].

## License

Apache-2.0

---

Made with <3 by the [Turbo](https://goturbo.gg) team.

*Range Finder Classic is not affiliated with Blizzard Entertainment.*
