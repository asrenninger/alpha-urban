# AlphaUrban

AlphaEarth compresses every place on Earth into 64 numbers, and those numbers separate one city from another easily. This project asks what they keep of the differences inside a single city, and what a representation would have to give up to keep more.

[Visit the website](https://asrenninger.github.io/alpha-urban/). It is a static site in `docs/`, published by GitHub Pages from `main`, with no build step.

## The walk

The site opens on one field, 51 km across, covering Singapore, Johor Bahru and Batam in 2024. It shows the field first in the embedding's own colours, then under a land cover legend, then as a cloud of points on the embedding sphere. Greenness organises that cloud. The dominant axis of the embedding tracks vegetation, which separates forest from built land and says nothing about one part of a city against another. Inside the built class the field runs from sheds to towers, and the walk measures how much of that range the embedding keeps. The built class occupies a pocket about as wide as any single natural class, and low-rise and high-rise Singapore sit closer together than forest sits to water.

The same walk then runs through Mexico City, and both cities are set in the frame the planet defines, with axes fit on the mean directions of 1,000 cities. Each city collapses to a single direction. Continent and climate sort those directions cleanly, and population sorts them weakly. Cities cluster away from the rest of the land, a median 74° apart from one another, while a city's own cells spread by about half that around their mean. The closing globe stays in place for the next part of the story.

## From fingerprints to change

The sphere becomes an interactive atlas of all 1,000 city means, with Singapore selected by default so the full account is present even without a click. For any selected city, the site reports its nearest city means in the native 64-dimensional geometry and five repeated split-half checks based on all 840,776 sampled urban pixels.

The temporal view retains the same 1,000 cities and all 8,000 city-years from 2017–2024. This balanced support is required here because each trajectory is translated to its own 2017 origin before its subsequent movement is compared. The same canvas then centres eight illustrative urban-centre clouds and turns their means into an unadjusted HDI scatter with 977 cities in 157 countries. Scrolling adds context controls, makes the change to a common 942-city sample explicit, then adds population distribution, built form, settlement age, climate, vegetation and radar. All 1,000 identities persist, with missing-input cities in a grey row. [DISPERSION_DATA.md](docs/DISPERSION_DATA.md) records the controls, adjusted point construction and larger-sample sensitivities.

## What should the representation learn?

The next section is a global experiment. A small country-weighted model nudges the AlphaEarth embeddings toward three goals: vegetation, building volume and land cover. The reader sets the weight on each goal by dragging inside a triangle. There are 81 trained settings, 79 with held-out scores, and the display blends neighbouring fitted representations between them. The shared visual layer retains all 998 eligible cities; score cards use every target-valid held-out row and compare against original AlphaEarth. [JOINT_ADAPTER_DATA.md](docs/JOINT_ADAPTER_DATA.md) gives the full samples, score definitions and limits.

## Two cities at a time

The site ends by letting the reader choose two of eight cities and follow their pixels from maps into paired spheres that share one projection and one camera. Colour can show false colour, degree of urbanisation, NDVI, land cover or building volume on the same scale in both cities. Two numbers summarise the pair in all 64 dimensions: the angle between the two mean directions, and how far the ten main directions of spread in each city align. Distribution curves then compare the values behind each colour. Every valid pixel of every field is used, including water, and missing measurements are counted. [COMPARISON_DATA.md](docs/COMPARISON_DATA.md) records sources, coverage and file sizes.

## Limits worth knowing

The spheres are projections of 64 dimensions. Distance on screen is not distance in the embedding, and the site says so wherever a number appears. The comparison describes pixels in rectangular fields whose widths differ. It compares fields, and whole-city area and population are outside it. The final scene of the walk reports 273,410 non-city pixels behind the cities. A later audit of the source found 241,841 with valid support. That scene is preserved as published, and any correction must change its text and its assets together.

The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.
