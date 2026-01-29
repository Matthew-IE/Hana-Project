# Shading Editor Update

Finally got around to adding a proper shading editor to the controller app. No more hardcoded lighting values!

## What's New

### Shading Modes
- **Default** - The standard PBR look, same as before
- **Toon (Cel)** - Anime-style cel shading with sharp shadow edges

### Adjustable Settings
You can now tweak these in real-time from the settings panel:

- **Light Intensity** - How bright the main directional light is
- **Ambient Intensity** - Overall scene brightness (fills in the shadows a bit)
- **Light Direction** - X/Y/Z sliders to move the light around

When Toon mode is active, you also get:
- **Shadow Darkness** - Lower = darker shadows, higher = softer look
- **Saturation Boost** - Pump up those colors for that vibrant anime aesthetic (or dial it down for a washed-out look)

## Technical Stuff

The toon shading works by swapping out the VRM's materials for `MeshToonMaterial` with a custom gradient map. Had to do some extra work to handle MToonMaterial's uniform-based properties since VRM models use ShaderMaterials internally.

The saturation boost uses `onBeforeCompile` shader injection to modify the fragment shader directly, this was necessary because just tweaking the base color doesn't affect textured materials. The shader does a proper grayscale mix to adjust saturation on the final rendered output.

Eyes and certain face parts are excluded from the toon swap to avoid that creepy white-eye look.

All settings save to config automatically, so your preferences persist between sessions.

## Known Quirks

- Switching modes does a full material swap, so there might be a brief flash
- Some VRM models might look better in one mode vs the other depending on how they were authored
- The cel shading is pretty basic right now - might add more options later if needed
- Saturation values below 1.0 will desaturate, above 1.0 will make colors more vibrant

---

*Update: Jan 2026*
