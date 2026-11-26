# Sample websites

Deploy `static` directly with `deployhub deploy --dir ./examples/static --project sample-static --preview`. No build tools are needed. Verify the linked stylesheet and JavaScript button, update text, then deploy another version.

The `vite` folder is an actual build-source fixture. Source deployment requires a Linux Docker worker and deliberately authorized dependency-network access. Its successful framework build was not tested on the Windows host without Docker. Alternatively install/build it locally and upload its generated `dist` directory as a static website.
