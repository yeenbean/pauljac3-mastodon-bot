# pauljac3

The official bot for Pauljac3. Supports Mastodon and Bluesky. (and twitter now lol)

## TODO

- [ ] Random replies.
- [ ] Timeline streaming.
- [ ] Keyword replies.

## Contribution

Any help with the development of the bot is extremely appreciated! You can
submit bug reports and feature requests by using this repository's issues page.
You can also submit pull requests (when I enable it) to contribute your own
fixes and changes.

For historical reasons, issues and pull requests which modify the bot's posts
will be deleted. With that said, you're more than welcome to create your own
spinoffs of the bot!

## Development

### Preparing your environment

1. Clone this repository.
2. Copy `.env.example` to `.env` and fill with your development accounts' information.
3. If IntelliSense is important to you, run the bot to download and cache modules with `deno task start`.

### Before submitting pull requests

You must run `deno task lint` and `deno task fmt` before submitting your pull request. Additionally, `deno task lint` should return no errors.
