# Installation and setup

Read the [requirements](../README.md#what-youll-need) first. These instructions
are for a rooted TV with Homebrew Channel, not Developer Mode alone.

## 1. Connect to your TV

Enable SSH through your rooted TV setup. Configure an SSH host named `lg-tv`
on your computer that connects as root to your TV's address using your SSH key.
Verify the TV's host key before trusting it. Do not disable host key checking.

The `bin/tv` helper contains the author's IP address and MAC address.
Change `DEFAULT_IP` and `TV_MAC` for your TV before using it. Then check:

```sh
ssh lg-tv 'id'
bin/tv --check
```

The TV must be on and connected to the same network as your computer.

## 2. Prepare the playback runtime

**A fresh clone is not enough to install the runtime.** The runtime binaries
and libraries are not included in Git or the app release. There is currently
no automated download-and-setup script for them.

See [runtime/README.md](../runtime/README.md) for the required files and their
sources. You need Node, ffmpeg, ffprobe, the ARM libraries, and a patched
Stremio server in the listed locations. Use compatible ARM hard-float builds;
the TV's system libraries cannot replace the private runtime libraries.
See the [technical guide](technical.md) for why.

If those files are missing, stop here and prepare them first. Do not run the
runtime installer with an incomplete folder.

## 3. Install

On your computer you need Git, Python 3, Bash, OpenSSH, and tar. Clone this
repository and open a terminal in its folder. Before replacing an existing
installation, back up `/media/developer/stremio` from the TV to your computer
and keep the previous app package so you can roll back.

With the complete runtime ready, run:

```sh
tools/install-runtime.sh
tools/deploy.sh
```

The first command installs the playback runtime. It replaces an existing
runtime, so make the backup first. The second builds the app package, installs
it, and opens Stremio on the TV. Installing closes the app if it is open.

Sign in and try playing a stream. Check sound and subtitles too.

## If something goes wrong

- **SSH cannot connect:** check that the TV is on, SSH is enabled, and its
  address is correct. SSH may take a little time to start after turning on.
- **Host key changed:** stop and verify the TV's identity before reconnecting.
- **The app opens but playback fails:** check that the full runtime is installed
  and Homebrew Channel's root command service is available. Try another stream.
- **Need to undo a runtime replacement:** restore your saved runtime folder;
  keep ownership and permissions intact. See the technical guide for service
  commands. Do not factory-reset the TV.
