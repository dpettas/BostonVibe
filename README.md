# MyBlog Places App

A local, file-backed travel wishlist for saving places, photos, categories, tags, ratings, and map coordinates.

## Development

The editable app source lives in `src/*.ts`. Browser-ready JavaScript is emitted to `js/*.js`, which is what `index.html` loads.

Install the local TypeScript compiler once:

```bash
npm install
```

After editing TypeScript files, rebuild the browser scripts:

```bash
npm run build
```

Do not run `npm install`, `npm run build`, or normal `git` commands with `sudo`. These commands should run as the `dpettas` user so project files stay writable.

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

The local server stores saved places in `data/mytravelblog_db.json` and uploaded photos in `data/images/`.

This project intentionally tracks both the JSON database and uploaded photo files in Git so they can be pushed to GitHub with the app. Do not add `data/mytravelblog_db.json`, `data/images/`, `.webp`, `.jpg`, or other uploaded image formats to `.gitignore` unless the project storage policy changes.

## Troubleshooting

If `npm install` or `git commit` fails with `EACCES` or `insufficient permission`, fix repository ownership and retry:

```bash
sudo chown -R dpettas:dpettas /home/dpettas/BostonVibe
npm install
npm run build
```
