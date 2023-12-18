const response = await fetch('https://wow.curseforge.com/api/game/versions', {
  headers: {
    'X-Api-Token': process.env.CURSEFORGE_TOKEN!,
  }
})

const versions = await response.json()
console.log(versions)