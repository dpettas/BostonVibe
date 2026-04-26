# MyBlog Places App

A local, file-backed travel wishlist for saving places, photos, categories, tags, ratings, and map coordinates.

## Run locally

```bash
python3 serve.py
```

Then open:

```text
http://localhost:3000
```

If port `3000` is already busy:

```bash
python3 serve.py 3001
```

## Data

The local server stores saved places in `data/mytravelblog_db.json` and uploaded photos in `data/images/`. These files are ignored by Git so personal place data and photos are not published accidentally.
