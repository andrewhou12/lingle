import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import OpenAI from 'openai'

export const POST = withAuth(async (request) => {
  const formData = await request.formData()
  const audioFile = formData.get('audio')
  if (!audioFile || !(audioFile instanceof Blob)) {
    return NextResponse.json({ error: 'audio file is required' }, { status: 400 })
  }

  const openai = new OpenAI()

  const file = new File([audioFile], 'recording.webm', { type: audioFile.type || 'audio/webm' })

  const transcription = await openai.audio.transcriptions.create({
    model: 'gpt-4o-mini-transcribe',
    file,
    language: 'ja',
  })

  return NextResponse.json({ text: transcription.text })
})
