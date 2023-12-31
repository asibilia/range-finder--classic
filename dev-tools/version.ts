import chalk from 'chalk'

const glob = new Bun.Glob("*.toc")
for await (const filename of glob.scan("./")) {
      console.log(
        chalk.white('\nBumping package version... \n'),
      )

      const file = Bun.file(`./${filename}`)
      const { version } = await Bun.file('./package.json').json()

      const fileContent = await file.text()
      const newContent = fileContent.replace(/## Version: [0-9]+\.[0-9]+\.[0-9]+/, `## Version: ${version}`)

      await Bun.write(`./${filename}`, newContent)

      console.log(
        chalk.green(`\nupdated: v${version} \n`),
      )
}