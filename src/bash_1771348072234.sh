# Initialized git repo
git init

# Created .gitignore for best practices
echo "node_modules/" > .gitignore
echo ".DS_Store" >> .gitignore

# Staged and committed the files
git add index.html .gitignore
git commit -m "Initial commit: Add Hello World page"