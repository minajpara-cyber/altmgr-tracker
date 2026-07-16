# Deploying to GitHub Pages

This site is plain HTML/CSS/JS — no build step. You just need to push the `site`
folder to GitHub and turn on Pages. Total time: ~10 minutes the first time.

## 1. Get a GitHub account (skip if you already have one)

Go to <https://github.com/signup> and create a free account. Pick a username —
you'll need it below.

## 2. Create a new public repository

1. Click the **+** in the top-right of GitHub, then **New repository**.
2. Name it `altmgr-tracker` (or whatever you like).
3. Visibility: **Public** (required for free GitHub Pages).
4. Leave everything else blank. Click **Create repository**.

GitHub will show you a page with a green "Quick setup" box. Note the URL — it
looks like `https://github.com/YOUR-USERNAME/altmgr-tracker.git`.

## 3. Push the files from your Mac

Open Terminal (Cmd-Space → "Terminal"), then paste these commands one at a
time. **Replace `YOUR-USERNAME`** with your GitHub username.

```
cd ~/Downloads/altmgr_inventory/site
git init -b main
git add *.html style.css app.js data*.json secondaries.json README.md DEPLOY.md
git commit -m "Initial site"
git remote add origin https://github.com/YOUR-USERNAME/altmgr-tracker.git
git push -u origin main
```

When you run `git push`, GitHub will ask you to log in. The easiest path is to
install **GitHub CLI** beforehand (`brew install gh`, then `gh auth login`), or
use a **Personal Access Token** as the password (Settings → Developer settings →
Personal access tokens on github.com).

If `git` is not installed, macOS will prompt you to install the Xcode Command
Line Tools the first time you run it — click Install and wait ~5 minutes.

## 4. Turn on GitHub Pages

1. On your repo page, click **Settings** (top menu).
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
4. Branch: **main**, Folder: **/ (root)**. Click **Save**.
5. Wait 1–2 minutes. Refresh the Pages screen — you'll see a green box with
   your live URL.

## 5. Your URL

It will be:

```
https://YOUR-USERNAME.github.io/altmgr-tracker/
```

Bookmark it. The site is now live.

## 6. Re-deploying after a data refresh

After re-running the extractors and rebuilding `data.json`:

```
cd ~/Downloads/altmgr_inventory
~/Downloads/bdc_inventory/.venv/bin/python scripts/08_build_site.py
cp site/data*.json ~/Downloads/altmgr-tracker/
cd ~/Downloads/altmgr-tracker
git add data*.json
git commit -m "Refresh data"
git push
```

GitHub Pages will pick up the change automatically in ~1 minute.

## Troubleshooting

- **Push prompts for a password and rejects yours** — GitHub no longer accepts
  account passwords here. Use a Personal Access Token, or install `gh` and run
  `gh auth login` first.
- **404 after enabling Pages** — wait 2 minutes and refresh. First deploy is
  slow.
- **Charts don't load** — your network may block `unpkg.com` or `jsdelivr.net`.
  Try a different network.
