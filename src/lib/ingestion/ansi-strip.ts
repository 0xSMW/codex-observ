const ansiRegex = /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]/g
const oscRegex = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g
const twoCharRegex = /\u001B[@-Z\\-_]/g

export function stripAnsi(text: string): string {
  if (!text) return text
  return text.replace(oscRegex, '').replace(ansiRegex, '').replace(twoCharRegex, '')
}
