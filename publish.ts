import chalk from "chalk";

const name = "RangeFinder_Classic";
const OUTPUT_DIR = `./${name}`;

try {
  // Upload to CurseForge
  const body = new FormData();
  const zipFile = Bun.file(`./${name}.zip`);
  const changelog = await Bun.file(`./CHANGELOG.md`).text();

  body.append("file", zipFile, zipFile.name);
  body.append(
    "metadata",
    JSON.stringify({
      changelog, // Can be HTML or markdown if changelogType is set.
      changelogType: "markdown", // Optional: defaults to text
      displayName: "Range Finder (Classic)", // Optional: A friendly display name used on the site if provided.
      gameVersions: [10341], // A list of supported game versions, see the Game Versions API for details. Not supported if parentFileID is provided.
      releaseType: "beta", // One of "alpha", "beta", "release".
    })
  );

  console.log(chalk.white("\nUploading to CurseForge... \n"));

  const response = await fetch(
    `https://wow.curseforge.com/api/projects/${process.env
      .CURSEFORGE_PROJECT_ID!}/upload-file`,
    {
      method: "POST",
      headers: {
        "X-Api-Token": process.env.CURSEFORGE_TOKEN!,
        // 'Content-Type': `multipart/form-data; boundary=${body.getBoundary()}`,
      },
      body,
    }
  );

  if (response) {
    const json = await response.json();

    if (json.errorCode) {
      console.log(chalk.redBright('Error Code: ', json.errorCode));
      console.log(chalk.redBright('Message: ', json.errorMessage));
    } else {
      console.log(chalk.greenBright("Successfully uploaded to CurseForge!"));
      console.log(chalk.yellow(await response.text()));
    }

  }
} catch (err) {
  console.log(chalk.redBright(err));
}
