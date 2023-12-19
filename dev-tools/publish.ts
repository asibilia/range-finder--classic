import { exec } from "child_process";
import chalk from "chalk";
import { withQuery } from "with-query";

import { NAME } from './consants/name';

try {
  // Upload to CurseForge
  const form = new FormData();
  const zipFile = Bun.file(`./dist/${NAME}.zip`);
  const changelog = await Bun.file(`./dist/${NAME}/CHANGELOG.md`).text();

  form.append("file", zipFile, `${NAME}.zip`);
  form.append(
    "metadata",
    JSON.stringify({
      changelog, // Can be HTML or markdown if changelogType is set.
      changelogType: "markdown", // Optional: defaults to text
      displayName: "Range Finder (Classic)", // Optional: A friendly display name used on the site if provided.
      gameVersions: [10341], // A list of supported game versions, see the Game Versions API for details. Not supported if parentFileID is provided.
      releaseType: "release", // One of "alpha", "beta", "release".
    })
  );

  console.log(chalk.white("\nUploading to CurseForge... \n"));
  const request = fetch(
    withQuery(
      `https://wow.curseforge.com/api/projects/${process.env
        .CURSEFORGE_PROJECT_ID!}/upload-file`,
      {
        token: process.env.CURSEFORGE_TOKEN,
      }
    ),
    {
      method: "POST",
      body: form
    }
  );

  const response = await request
  const data = await response?.json();

  if (data) {
    if (data.errorCode) {
      console.log(chalk.redBright("Error Code: ", data.errorCode));
      console.log(chalk.redBright("Message: ", data.errorMessage));
    } else {
      console.log(chalk.greenBright("Successfully uploaded to CurseForge!"));
      console.dir(chalk.yellow(JSON.stringify(data, null, 2)));
    }
  }
} catch (err: any) {
  console.log(chalk.redBright(err));
}

const { version } = await Bun.file('./package.json').json();

await new Promise((resolve, reject) => {
  const commands = [
    'bun changeset publish',
    'git add .',
    `git commit -m "chore(release): v${version}"`,
    'git push --follow-tags',
  ]
  exec(commands.join('&& '), (err, stdout, stderr) => {
    if (err) {
      // node couldn't execute the command
      console.log(chalk.redBright(err));
      return;
    }

    console.log(chalk.yellow(stdout));

    // the *entire* stdout and stderr (buffered)
    if (stdout.length) {
      console.log(chalk.greenBright("Successfully published the project!"));
      resolve(true);
    } else {
      console.log(chalk.redBright(stderr));
      reject();
    }
  });
});