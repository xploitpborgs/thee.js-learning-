# One desk, one long day · Oluwasola Adebayo Godwin

A scroll-driven 3D portfolio. A real workstation in a dark room: a walnut desk, a 27-inch monitor, a
glass-sided PC tower with RGB fans, a mechanical keyboard, a wall-mounted switch and router, and a city
at night through the window. The monitor tells the story of a working day while the camera moves around
the desk:

| Time  | Chapter      | On screen and on the desk |
|-------|--------------|---------------------------|
| 08:00 | Sign-in      | Lock screen; the room wakes up |
| 08:30 | Onboarding   | Admin centre sets up a new starter; the laptop beside it enrolls and says "Welcome aboard" |
| 09:40 | Network      | Port 4 on the switch goes red, the fault is traced along its cable, the link comes back at 1 Gbps |
| 11:15 | Support      | The service-desk queue clears ticket by ticket while the keyboard types |
| 14:05 | Security     | The PC glows red under attack; the SIEM blocks, quarantines and records; contained, 0 breaches |
| 17:30 | Maintenance  | Updates roll out in rings, the backup drive blinks, the restore test passes |
| 23:00 | Always on    | All systems operational; the camera pulls back to the room at night |

Then: about, projects, experience timeline, skills, credentials and contact.

## Files
- `index.html`: page design, chapter captions, day clock, timeline scrubber, content and scroll wiring.
- `workstation.js`: the 3D scene (`UIConnect.workstation({ canvas })`, then `setProgress(p)`).
- `lib/`: Three.js r128, RectAreaLight support, and the procedural MacBook model and textures.

Everything is drawn in code; there are no model or image files. Serve the folder with any static host
(for example `python3 -m http.server`) and open `index.html`. URL helpers: `?p=0.5` jumps to a point in
the film, `?lite` forces the low-power path, `?nopost` turns off the glow pass.
