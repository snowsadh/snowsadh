# Ice-key counter

Read-only preview: <https://snowsadh-visits.snoe.workers.dev/side.svg?preview=1>.
Use `/count` on the same host for the exact total.

The Cloudflare Worker reuses `assets/side.svg` and `assets/side-mobile.svg` unchanged,
replacing only the four placeholder dashes and the accessible image title. Both
sizes share one persistent SQLite-backed Durable Object named `snowsadh`.
Only those two artwork files are uploaded, via `assets/.assetsignore`.

Each successful image GET adds one. It counts image loads, not unique people;
GitHub's image proxy can cache requests, so refreshing a profile will not always
increment it. There is no historical profile-view total to import. The application
does not collect IP addresses, cookies or visitor identities. Like other public
image counters, direct requests and bots can inflate it.

The display uses four digits with leading zeroes. At 10,000 it uses compact numbers
such as `10K`; the accessible title and `/count` keep the exact total.

## Commands

From this directory:

```sh
node test.mjs
npx --yes wrangler@4.151.3 login
npx --yes wrangler@4.151.3 deploy
```

The test uses isolated local storage; it does not inflate the live count. It checks
both image sizes, exact artwork preservation, compact numbers, input validation,
simultaneous requests and persistence across a restart. No runtime packages or
GitHub secrets are needed. Cloudflare's CLI handles local login credentials.

## Routes

- `/side.svg`, `/side-mobile.svg`: increment the shared total and return the image.
- Add `?preview=1` to either image to see the current total without incrementing it.
- `/count`: read-only JSON containing the exact total.
- `/health`: read-only Worker health check.
- `HEAD` requests do not increment the total.

Do not rename the Worker, the `Visits` class, its binding or the object name when
redeploying: these identify the stored counter. The SQLite-backed configuration
works on Workers Free; it does not enable a paid subscription. No scheduled
GitHub Action is involved in this counter.
