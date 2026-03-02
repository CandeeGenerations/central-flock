# hooks

To install dependencies:

```bash
pnpm install
```

To run:

```bash
npx tsx index.ts
```

Add this to your `package.json` file for the project:

```json
{
  "scripts": {
    "postinstall": "cd .claude/hooks && pnpm install"
  }
}
```
