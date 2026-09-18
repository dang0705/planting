# miniprogram-e2e

`miniprogram-e2e` runs E2E suites against a final WeChat Mini Program artifact.
It does not import application source code, build frameworks, or CloudBase clients.

The caller must explicitly provide the compiled artifact, a suite manifest, and a
project adapter:

```sh
mp-e2e run \
  --artifact /absolute/path/to/mp-weixin \
  --suite /absolute/path/to/suite.manifest.json \
  --adapter /absolute/path/to/project-adapter.mjs
```

The artifact root must contain `mp-e2e.contract.json`. The sidecar declares only
compiled-artifact capabilities. It never selects or loads the adapter.

The package has zero third-party runtime dependencies. `miniprogram-automator` is
an optional peer used only by the WeChat platform helper.

## Boundary

The reusable package validates and snapshots a compiled directory, executes a
declared suite, manages fixture lifecycle, writes a three-axis report, and
offers WeChat/macOS helpers. It does not discover adapters or leaves from the
asset, start a framework build, select a fixed port, read a daily DevTools
profile, or know an application endpoint.

`ProjectAdapter` is passed explicitly by the caller. It supplies its artifact
preparation, application-session, authentication, port/profile, and fixture
policies. A `Leaf` is registered with `defineLeaf`; a `Fixture` is registered
with `defineFixture({ prepare, verify, cleanup })`. In `live_real` runs fixture
cleanup must return a verified readback.

Reports always retain independent infrastructure, fixture, and business
statuses. `fixture_diagnostic` leaves are never silently promoted to
`live_real` evidence.
