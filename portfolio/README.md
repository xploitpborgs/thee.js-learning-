# Always On · Oluwasola Adebayo Godwin

A scroll-driven 3D portfolio. One fixed WebGL canvas plays a single camera move through an office while the page scrolls:

1. **Onboarding:** a new laptop is set up (account, licences, MFA, endpoint protection).
2. **Operations:** the office floor wakes up.
3. **Network:** cables to the rack light up, a link drops and is traced and restored.
4. **Support:** tickets appear over desks and remote sessions resolve them.
5. **Security:** a shield over the building stops attacks; a phishing email is quarantined.
6. **Maintenance:** a patch wave and a backup run to the rack.
7. **Always on:** the calm, secure building at night.

Then the projects, experience, skills toolbox, credentials and contact sections.

## Files
- `index.html`: page, styles, captions, content and scroll wiring.
- `office.js`: the film (`UIConnect.office({ canvas, labels, ... })`, then `setProgress(p)`).
- `lib/`: Three.js r128, the procedural MacBook model and textures, and the skills toolbox, reused from the tutorial build.

Everything is drawn in code; there are no model or image files. Serve the folder with any static host (for example `python3 -m http.server`) and open `index.html`. Add `?p=0.5` to the URL to jump to a point in the film.
