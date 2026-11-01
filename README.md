# Stremio for LG OLED55B8SDC

An unofficial Stremio app I built for my LG OLED55B8SDC running webOS 4.
Sign in with your Stremio account, pick something from your addons or library,
and watch from the couch with your remote or Magic Pointer.

## Why build another Stremio app?

My TV still works well, but it's old enough to miss out on the official
Stremio app. [LG's store listing](https://us.lgappstv.com/main/tvapp/detail?appId=1214520)
starts at 2020 models running webOS 5.0. My B8 runs webOS 4, so it falls
outside that supported range. [Stremio's announcement](https://blog.stremio.com/stremio-is-now-available-on-lg-tvs-for-models-2020/)
also confirms the 2020-and-newer cutoff.

There's a real platform gap here: older webOS TVs have a much older browser
inside them. [LG's developer docs](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)
list Chromium 53 for webOS 4, compared with Chromium 68 for webOS 5.
That helps explain why supporting these TVs takes extra work, though Stremio's
announcement doesn't give a specific technical reason for its cutoff.

I wanted to keep using the TV I already had, so this project gives it a
simpler interface built for its older browser, plus a separate playback
runtime that runs on the TV. Other community apps exist too; this is the
approach I've built and checked on my own TV. It isn't affiliated with
Stremio or LG.

## Will it work on my TV?

**I've only tested this app on my LG OLED55B8SDC.** In theory, it should work
on other rooted LG TVs running webOS 4 too, but that hasn't been verified.
Different hardware, firmware, or supported video formats may need adjustments.
If you try it on another webOS 4 model, please let us know how it goes.

## Built with help from AI agents

I relied heavily on AI coding agents to build this project, and we checked
that the functionality worked on my TV along the way. That doesn't mean we
caught everything.

If you spot a mistake in the app or these instructions, please
[open a GitHub issue](https://github.com/andy-spike/stremio-for-lg-oled55b8sdc/issues).
Tell me your TV model, webOS version, what you tried, and what happened.
I'll take a look with an agent and work on a fix. Please leave out passwords
and other private account details.

## What you’ll need

- A **rooted LG TV**. Developer Mode alone is not enough for this app.
  See the [webOS Homebrew rooting guide](https://www.webosbrew.org/rooting/)
  and check your model and firmware before choosing a method.
- Homebrew Channel installed, with its root command service available.
- A computer that can connect to the TV over SSH as root, on the same network.
- An internet connection and a Stremio account. Set up your addons in Stremio
  on your phone or computer first.
- The app **and its playback runtime** installed on the TV (see below).

## Getting it onto your TV

There are two parts: the TV app and the playback runtime. The runtime does
work that the older TV browser cannot do on its own.

**Fresh installation:** use the agent instructions below or follow the
[installation guide](docs/install.md). There’s a bit of setup involved for now;
we don’t have a complete one-click installer yet.

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

## Watching something

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
