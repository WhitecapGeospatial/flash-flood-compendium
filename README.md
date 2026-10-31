# Flash Flood Compendium

A full-page map of documented flash flood events. Click an event to zoom in. If the event has affected locations, they spread out from the event point. A side panel (a bottom sheet on mobile) shows the event details.

Live site: https://whitecapgeospatial.github.io/flash-flood-compendium/

The site is fully static. The browser fetches one GeoParquet file, parses it with [hyparquet](https://github.com/hyparam/hyparquet), and renders it with deck.gl over a MapLibre basemap. There is no server.

The file is fetched whole, not with HTTP range requests. GitHub Pages gzips the response and applies `Range` to the gzipped bytes, which breaks ranged Parquet reads. At ~140 KiB, one request is also faster.

## Data

**Source:** the "Combined FFC" tab of the Combined Flash Flood Compendium sheet on Google Drive:
https://docs.google.com/spreadsheets/d/1P56EW2KuHZoR_2kLmd1mw0Dfv7dvLux5uiSsCGrPWvk/edit?gid=1328876161#gid=1328876161

`scripts/build-data.ts` reads the CSV export from `data/raw/combined-ffc.csv` and normalizes it into `public/data/ffc.parquet`. Only the Parquet is committed. `data/raw/` is gitignored because the export contains personal contact names.

To refresh the data:

1. In the sheet, export the Combined FFC tab: File → Download → CSV.
2. Save the export as `data/raw/combined-ffc.csv`.
3. Run `bun run data`.
4. Read the warnings it prints, then commit `public/data/ffc.parquet`.

### Model

Each row of `ffc.parquet` is one record:

- `level = "event"`: one per flood event (sheet `Event_summary`). These are the points on the map.
- `level = "location"`: an affected location under an event (sheet `Affected_location`), joined by `event_id`.

The file is GeoParquet 1.1 with a WKB `geometry` point column, so QGIS, DuckDB and GeoPandas open it directly. List fields (tags, links) are `|`-separated strings.

### What the pipeline fixes

The sheet joins two schemas side by side. Columns 0–58 are the current compendium. Columns 59–76 repeat several fields from the older compendium under different labels. Current values win; older values fill gaps.

| Issue in the sheet | Handling |
|---|---|
| `Event_ID`/`Record_ID` only filled on the first ~230 rows | An `Affected_location` belongs to the `Event_summary` above it. Missing IDs are assigned after the existing maximum. |
| A few location rows carry an `Event_ID` one higher than the summary they sit under (lines 150, 151, 157) | Kept with the summary above them, because country and date match it. |
| `Event_ID` 48 used by two different summaries (line 95) | The second summary gets a new ID. |
| 16 Guatemala rows with blank `Record_Level` (lines 734–749) | Treated as affected locations of the summary above them. |
| Excel-mangled ranges in the old schema (`10-Jan` = 1–10, `20-Nov` = 11–20) | Converted back. `10000 or more` becomes `10,001+` to match the current bins. |
| Mixed confidence such as `High, Medium` | Takes the lower level. |
| Tag spellings differ between schemas (`Surface runoff` / `Surface Runoff`, `landside`) | Merged case-insensitively; the current schema's spelling wins. |
| `Spatial Geometry` cells that hold expiring Airtable attachment URLs | Dropped. |
| Events with no coordinates of their own but with located affected locations (31) | Placed at the centre of their locations, with an uncertainty radius that covers them. The panel says "Centre of affected locations". |
| Events with no coordinates at all (8) | Listed under **Filters → Not on map**. |

**Not published:** `Red Cross Contact` and `National Contact` hold personal names. They are left out of the Parquet because the repository is public.

**Known data problems not changed by the pipeline:** some uncertainty radii look like kilometres entered as degrees. Examples: Freetown 15°, Western Uganda (Kasese) 25°, Dili 15°. Fix these in the sheet.

## Field choices

**On the map**

- Event points come from `Area Latitude`/`Area Longitude` (summary rows).
- Every event and affected location is the same red dot, at a fixed size. Neither colour nor size encodes confidence or impact; confidence is shown as a pill in the panel and is a filter.
- Location uncertainty comes from `Uncertainty in Area Lat/Long (degrees) - radius`. The older `Uncertainty in Lat/Long (km)` fills gaps. It appears only for the hovered point and the selected event: a translucent white disc with a dashed edge, at least 12 px across so it clears the dot. The legend says it is not the flooded area.
- The basemap follows the system light/dark setting: CARTO Positron (light, the default) or Dark Matter. The UI follows the same setting through the design tokens.
- The time scrubber uses `Start Date`.
- Filters:
  - Confidence
  - Meteorology tags
  - Hydrology tags
  - Impact: any reported dead, injured, missing, displaced, affected, houses, agriculture or livestock
  - Spatial scale of impact

**Drill-in panel**

- **Headline:** start–end date (± date uncertainty), impacted area name, country, event name, confidence pill, limitations.
- **Meteorology / hydrology:** meteorology, hydrology and flood dynamics tags; heavy rain start, duration and reported rainfall; flash flood watch/warning; GPM IMERG, IRI, CMORPH and Copernicus Weather Replay links; analyst notes.
- **Impact:** the eight impact ranges, countrywide damage cost, spatial scale, region, human–land interaction, infrastructure, response (staff, volunteers, actions) and the affected locations list. Hovering a location highlights it on the map.
- **Links:**
  - IFRC GO emergency links and the IFRC GO flood flag
  - Dartmouth Flood Observatory number
  - A video viewer that embeds YouTube and Facebook videos and links other hosts. Some rights holders (for example AFP) block YouTube playback on other sites; the viewer detects this through the IFrame Player API (`onError` 101/150) and shows a "Watch on YouTube" card instead
  - Media links from the event and its locations

Open an event directly with `#event=<event_id>`.

## Development

Requires Bun, plus a GitHub token with `read:packages` for the private `@whitecapgeospatial/*` design system packages (see `.npmrc`).

```sh
NODE_AUTH_TOKEN=$(gh auth token) bun install
bun run dev        # http://localhost:5173/flash-flood-compendium/
bun run typecheck
bun run build      # → dist/
```

## Deployment

`.github/workflows/deploy.yml` typechecks and builds every PR. On `main` it also deploys `dist/` to GitHub Pages. The install step needs a repository secret `NPM_GITHUB_TOKEN`: a PAT with `read:packages`, the same one `WhitecapGeospatial/threelibre` uses.
