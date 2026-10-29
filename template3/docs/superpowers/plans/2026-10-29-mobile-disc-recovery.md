# Mobile disk visibility recovery

Observed: ordinary WebKit and Chromium mobile simulation can render the gallery, but deliberate WebGL context loss reproduces the screenshot's metadata-only blank gallery. The original lost-context handler stops rendering without a visual fallback, and lost renderers can enter the reusable pool. Mobile portrait atlas textures also remain allocated after leaving the introduction.

- [x] Reduce mobile gallery artwork resolution before initialization, and release the portrait atlas when the mobile gallery owns the screen; reload it on return.
- [x] Skip direct canvas reveal animation on coarse-pointer devices and repaint the gallery after handover/return from a backgrounded page.
- [x] Add a raster/CSS disk fallback for context loss or failed/stuck initialization, with current project metadata, swipe/buttons, keyboard, Index navigation and detail links. Dispose the failed native scene; never pool a lost renderer.
- [x] Verify ordinary WebKit/Chromium, forced context loss, failed WebGL initialization, navigation synchronization, mobile resize and portrait return. Check desktop and existing tests, then commit/push/deploy and verify the public URL.

Keep existing 3D rendering when healthy. Desktop layout and public project content do not change. Simulation cannot prove the precise GPU failure on the photographed physical iPhone; recovery tests cover the reproducible blank-renderer failure and remove mobile GPU pressure/compositing risks.

Local validation: all four WebKit/Chromium failure scenarios pass at 393 x 852, DPR 3. Covers current-project preservation, buttons, swipe, Index, portrait release/reload, landscape overflow and detail navigation. Existing cyclic portrait browser verification passes; 23 Node tests, two Python build tests, syntax checks and the nine-project production build pass. The mobile About me control is raised above the center navigation so it remains tappable.

Production: application commit `86b2d2c`, Vercel deployment `dpl_DnpF8JDKYdDZU9nC5xBwnPNEJaAN`, alias https://portfolio-indol-one-ram3c051o2.vercel.app. All four recovery scenarios pass against the public alias with zero page errors, including active Index highlighting. Ordinary public WebKit rendering was visually checked after handover: native 3D remains active, artwork resolution is 512, and the portrait renderer is released.
