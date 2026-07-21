# Deploying THE ONLY MIND (Railway)

One root service from this repo — the workspaces must NOT be auto-split.

## Steps

1. **New Project → Deploy from GitHub repo** → pick this repo, `main` branch.
   `railway.json` sets the start command (`npm run start`), the healthcheck
   (`/api/health`), and restart-on-failure — which is what makes the admin
   FULL RESET work: the process exits non-zero and Railway reboots a fresh mind.
2. **Attach a Volume** to the service, mounted at `/data`.
   Without it the entire archive (every thought, world, vision) resets on
   every redeploy.
3. **Variables** (service → Variables):

   | var | value |
   |---|---|
   | `DB_PATH` | `/data/onlymind.db` |
   | `BRAIN_MODE` | `live` |
   | `LLM_API_KEY` | your key |
   | `LLM_BASE_URL` | `https://api.openai.com/v1` (or any OpenAI-compatible) |
   | `LLM_MODEL` | e.g. `gpt-4o` |
   | `LLM_DAILY_USD` | e.g. `10` |
   | `ADMIN_PASSWORD` | pick one (enables `/admin.html`) |
   | `CA` | the contract address (`placeholder` disables it) |
   | `IMAGE_DAILY_USD` | e.g. `2` (visions budget) |
   | `IMAGE_QUALITY` | `low` \| `medium` |

   Optional: `IMAGE_API_KEY`, `IMAGE_BASE_URL`, `IMAGE_MODEL`, `IMAGES=off`,
   `LLM_PRICE_IN`, `LLM_PRICE_OUT`, `IMAGE_PRICE`.
   `PORT` is injected by Railway automatically.
4. **Generate a domain** (service → Settings → Networking).

First boot ignites a fresh mind (the live brain composes its own genesis).
Visions are stored on the volume at `/data/visions`.
