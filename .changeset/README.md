# Changesets

To add a changeset:

```sh
yarn changeset
```

Select the packages changed, bump type (major/minor/patch), and describe the change.

To release:
1. Merge the "Version Packages" PR opened by the bot
2. CI publishes automatically
