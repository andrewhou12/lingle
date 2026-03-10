import { HumeClient } from 'hume'

const apiKey = process.env.HUME_API_KEY
if (!apiKey) {
  console.log('Set HUME_API_KEY env var first')
  process.exit(1)
}

const hume = new HumeClient({ apiKey })

try {
  const config = await hume.empathicVoice.configs.createConfig({
    name: 'Lingle CLM',
    eviVersion: '4-mini',
    languageModel: {
      modelProvider: 'CUSTOM_LANGUAGE_MODEL',
      modelResource: 'https://flavory-becky-acropetal.ngrok-free.dev/api/voice/hume-clm/chat/completions',
    },
  })

  console.log('Config created!')
  console.log('Config ID:', config.id)
  console.log('\nAdd this to your .env.local:')
  console.log(`HUME_CONFIG_ID=${config.id}`)
  console.log('\nNow go to the Hume dashboard, edit this config,')
  console.log('and set the CLM URL to your ngrok endpoint:')
  console.log('https://<your-ngrok-url>/api/voice/hume-clm/chat/completions')
} catch (e) {
  console.error('Failed:', e.message || e)
}
