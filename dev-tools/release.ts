import { exec } from "child_process";
import chalk from "chalk";

import { NAME } from './consants/name';

const OUTPUT_DIR = `./dist/${NAME}`;

const glob = new Bun.Glob("*");
for await (const filename of glob.scan("./")) {
  if ([
    'RangeFinder_Classic.lua',
    'RangeFinder_Classic.toc',
    'RangeFinder_Classic.xml',
    'LICENSE',
    'README.md',
    'CHANGELOG.md',
  ].includes(filename)) {
    const file = Bun.file(`./${filename}`);
    await Bun.write(`${OUTPUT_DIR}/${filename}`, file);
  }
}

console.log(chalk.white("\nZipping the project... \n"));

await new Promise((resolve, reject) => {
  exec(`cd ./dist && zip -r ${NAME}.zip ${NAME}`, (err, stdout, stderr) => {
    if (err) {
      // node couldn't execute the command
      console.log(chalk.redBright(err));
      return;
    }

    console.log(chalk.yellow(stdout));

    // the *entire* stdout and stderr (buffered)
    if (stdout.length) {
      console.log(chalk.greenBright("Successfully zipped the project!"));
      resolve(true);
    } else {
      console.log(chalk.redBright(stderr));
      reject();
    }
  });
});