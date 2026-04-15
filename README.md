# The Pouch Report

Daily brand intelligence newsletter for r/NicotinePouch — covering Velo, Zyn, On!, Rogue & ALP.

## Deploy to Vercel (10 minutes)

### Step 1 — Push to GitHub
1. Go to github.com and create a new repository called `pouch-report`
2. Upload all these files to the repo (drag and drop works on GitHub)

### Step 2 — Deploy on Vercel
1. Go to vercel.com and sign in with your GitHub account
2. Click **"Add New Project"**
3. Select your `pouch-report` repository
4. Click **"Deploy"** (no build settings needed)

### Step 3 — Add your API key
1. In Vercel, go to your project → **Settings** → **Environment Variables**
2. Add a new variable:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your key from console.anthropic.com
3. Click **Save**
4. Go to **Deployments** and click **Redeploy** (so it picks up the new env var)

### Done!
Visit your Vercel URL and click "Generate Today's Brief".

## Cost
- ~$0.003 per newsletter generation (less than half a penny)
- $5 in Anthropic credits ≈ 1,600 generations
