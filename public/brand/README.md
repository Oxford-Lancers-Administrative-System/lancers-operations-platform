# Brand assets

Owner-supplied, exported from the Figma brand board
(_Oxford Lancers — OULAFC Branding and Social Media_, page **Brand**). Agents
cannot read the Figma, so nothing here is drawn by an agent except the one
placeholder named below.

| File           | Status                                           | Used by                                        |
| -------------- | ------------------------------------------------ | ---------------------------------------------- |
| `crest.svg`    | **Placeholder** until Brian's export replaces it | `src/components/brand-mark.tsx` (`CREST_PATH`) |
| `wordmark.svg` | Not yet supplied; the name is set in Geist       | —                                              |
| `lockup.svg`   | Not yet supplied (horizontal crest + wordmark)   | —                                              |

**Canonical crest:** `crest.svg`. Replace the file in place; the shell, the
public masthead and the login page pick it up without a code change. Export as
SVG; if the source is raster, a PNG at 2× named `crest@2x.png` is the fallback
and `brand-mark.tsx` gains one line.

The placeholder is an Oxford Blue shield with a Gold rule — deliberately not a
lancer, not a lion, not anything that could be mistaken for the club's own
mark. It exists so the shell can be judged with a crest in the right place at
the right size (32px in the sidebar, 40px on the login card).
