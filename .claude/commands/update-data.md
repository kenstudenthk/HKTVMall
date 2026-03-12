Update the website with the latest scraped deals data.

Execute the following steps in order:

1. Copy deals.json to the static site:
```
bash build.sh
```

2. Commit and push the updated data:
```
git add data/deals.json site/data/deals.json
git diff --cached --quiet || git commit -m "Update pet food deals data"
git push
```

3. Report the results:
   - Whether build.sh succeeded
   - Whether there were changes to commit
   - The git commit hash if a commit was made
   - Any errors encountered

If any step fails, show the error and suggest a fix.
