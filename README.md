# AlphaUrban

Earth embeddings promise one geometry in which every city can be compared. AlphaEarth gives every 10 m of land a vector of 64 numbers built from Sentinel-1, Sentinel-2 and Landsat, and the numbers carry no urban legend: no classes, no thresholds, only distance. I wanted to know whether that geometry holds up for cities, so I sampled 840,776 locations in 1,000 urban areas across 162 countries, in every annual layer from 2017 to 2024, and asked five things.

**Do cities occupy their own part of the representation?** Yes. They sit in a shifted but overlapping region about 63° from the global mean, and every one of the 1,000 cities can be told from the others using half of its own pixels.

**Do differences between cities follow geography?** Continent and climate predict a quarter of the variation among city means in countries the model never saw. The differences form a continuum, and no cut of the tree produces clean types.

**How much variation survives inside the standard degrees of urbanisation?** About 91%. The legend is coarse, what it leaves behind is structured, and a typical city spreads its variation over about six directions where the pool of all cities spreads over sixteen.

**Is variation represented equally everywhere?** No. Dispersion within urban centres is 14% greater per standard deviation of national development. Vegetation contrast, radar texture and built form account for most of that, and the same landscape effect holds inside countries where development is fixed, so the gradient belongs to the landscape rather than to development.

**Can the annual layers be read as change?** Not yet. A city's representation moves about 11° a year and ends 2° a year from where it started, and cities that lost a Sentinel-1B viewing direction in 2022 contracted measurably while nothing on the ground changed. Comparison across regions holds. Comparison over time is not yet validated.

The paper, main text and supplementary information, is [paper/alpha-urban.pdf](paper/alpha-urban.pdf). The website is [asrenninger.github.io/alpha-urban](https://asrenninger.github.io/alpha-urban/).

The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.
