# AI training photos (not committed)

Put labelled phone photos here to train the advisory classifier:

```
ai-data/model/Tecno Spark 10/*.jpg      one folder per supported model (name must match "Brand Model" in the catalogue)
ai-data/damage/Cracked screen/*.jpg     one folder per visible-damage class
```

Then run `npm run ai:train` and `npm run ai:eval -- damage` (or `model`).
Photos here are git-ignored; only this README is committed.
