# Stremio for LG OLED55B8SDC

An unofficial Stremio app made for the LG OLED55B8SDC running webOS 4.
Sign in to your Stremio account to use your addons, library, and Continue
Watching on your TV. Use the remote or Magic Pointer to browse and play.

This project has been tested on this TV. Other LG models may need changes.
It is not affiliated with Stremio or LG.

## Requirements

- A **rooted LG TV**. Developer Mode alone is not enough for this app.
  See the [webOS Homebrew rooting guide](https://www.webosbrew.org/rooting/)
  and check your model and firmware before choosing a method.
- Homebrew Channel installed, with its root command service available.
- A computer that can connect to the TV over SSH as root, on the same network.
- An internet connection and a Stremio account. Set up your addons in Stremio
  on your phone or computer first.
- The app **and its playback runtime** installed on the TV (see below).

## Install

There are two parts: the TV app and the playback runtime. The runtime does
work that the older TV browser cannot do on its own.

**Fresh installation:** use the agent instructions below or follow the
[installation guide](docs/install.md). This currently needs some setup;
there is no complete one-click installer.

**Already have the runtime installed?** Download the `.ipk` file from the
[latest release](https://github.com/andy-spike/stremio-for-lg-oled55b8sdc/releases/latest)
and install it using your rooted TV's app installer. An `.ipk` is the TV app
package; it does not include the playback runtime.

### Ask an agent to install it

Open a coding agent on your computer, give it this repository, and paste:

> Help me install Stremio for LG OLED55B8SDC from
> https://github.com/andy-spike/stremio-for-lg-oled55b8sdc.
> Read README.md, docs/install.md, docs/technical.md, and runtime/README.md first.
> Check my TV model, webOS version, root access, and Homebrew Channel.
> Ask me for my TV's address and help me set up SSH securely.
> The connection helper in this repo is configured for the author's TV;
> adapt it to mine before using it. Check that all playback runtime files
> are available; a fresh clone does not contain them. If any are missing,
> explain what is needed before attempting installation.
> Back up an existing installation before replacing it. Install both the
> runtime and app, then help me sign in and check playback.
> Do not root, factory-reset, or reboot my TV without asking me first.

Your agent can handle the computer steps. You will still need to turn on the
TV and complete any steps that require your remote or account sign-in.

## Use the app

1. Open **Stremio** from the TV's home bar (the purple tile with a white play button).
2. Follow the sign-in instructions on screen.
3. Browse your library or search for something to watch.
4. Choose a title, then choose a stream from your addons.
5. During playback, use the player controls to choose audio and subtitles.

Use the arrow keys and OK to move and select. Back returns to the previous
screen. You can also use the Magic Pointer.

Available streams depend on your addons. Some files may not play on this
older TV; try another stream if that happens. DTS audio is converted for the
TV, but AV1 video is not supported.

## Updates

Open **Settings → Updates → Check for updates**.
Choose **Install app** when a new app version is available. The app closes
and opens again during installation. The playback server checks for updates
automatically once a day.

The Updates screen also lets you return to the previous app or server version
when one is available.

## More help

- [Installation and setup](docs/install.md)
- [Technical guide](docs/technical.md): playback, updates, privacy, and development
- [Runtime files](runtime/README.md)
- [Report a problem](https://github.com/andy-spike/stremio-for-lg-oled55b8sdc/issues)
  with your TV model, webOS version, and what happened. Do not include passwords.

## License

The original code in this project is available under the [MIT License](LICENSE).
Third-party software keeps its own license, including the vendored hls.js
and the separately installed playback runtime.
