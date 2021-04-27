#!/usr/bin/env node

const beep = require("beepbeep");
const https = require('https');
const { exec } = require("child_process");
const meow = require("meow");

const cli = meow(`
Usage
  $ covid-vaccine-checker <zipcode> <range (miles)>

Options
  <zipcode> Your zip code
  <range>   The range from your zip code you are searching (default: 50 miles)

Examples
  $ covid-vaccine-checker 76210
  A store at Albertsons 4191 - 4351 Fm 2181, Corinth, TX, 76210 is now avaliable (https://kordinator.mhealthcoach.net/vcl/1597879608762)
`);

if (cli.input.length === 0) {
  throw new Error('Zip code required');
} else if (cli.input.length === 1) {
  cli.input[1] = 50;
}

/* Thanks to {@link https://stackoverflow.com/a/63988061/13514657} */
const httpsGet = (url) => {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        res.setEncoding("utf8");
        const body = [];
        res.on("data", (chunk) => body.push(chunk));
        res.on("end", () => resolve(body.join("")));
      })
      .on("error", reject);
  });
};

const httpsGetRedirectedURL = (url) => {
  return new Promise((resolve, reject) => {
    exec(
      "curl -Ls -o /dev/null -w %{url_effective} " + url,
      (error, stdout, stderr) => {
        if (error || stderr) {
          reject(error || stderr);
        }
        resolve(stdout);
      }
    );
  });
};

(async function () {
  const redirectedSearchParamWeatherForecast = new URL(
    await httpsGetRedirectedURL(
      "https://forecast.weather.gov/zipcity.php?inputstring=" + cli.input[0]
    )
  ).searchParams;
  global.zipCodeLatLong = [
    redirectedSearchParamWeatherForecast.get("lat"),
    redirectedSearchParamWeatherForecast.get("lon"),
  ];
})();

/* Thanks to {@link https://stackoverflow.com/a/27943/13514657} */
function getDistanceFromLatLonInKm(point1, point2) {
  const [lat1, lon1] = point1;
  const [lat2, lon2] = point2;
  const earthRadius = 6371;
  const dLat = convertDegToRad(lat2 - lat1);
  const dLon = convertDegToRad(lon2 - lon1);
  const squarehalfChordLength =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(convertDegToRad(lat1)) *
      Math.cos(convertDegToRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const angularDistance =
    2 *
    Math.atan2(
      Math.sqrt(squarehalfChordLength),
      Math.sqrt(1 - squarehalfChordLength)
    );
  const distance = earthRadius * angularDistance;
  return distance;
}

function convertDegToRad(deg) {
  return deg * (Math.PI / 180);
}

async function getRangedStores() {
  JSON.parse(
    await httpsGet(
      "https://s3-us-west-2.amazonaws.com/mhc.cdn.content/vaccineAvailability.json?v=1618531093677"
    )
  ).filter(
    (store) =>
      getDistanceFromLatLonInKm(zipCodeLatLong, [store.lat, store.long]) /
        1.609 <=
      50
  );
}

(async function () {
  global.rem = await getRangedStores();
})();

setInterval(async () => {
  var nextRem = await getRangedStores();
  if (JSON.stringify(nextRem) !== JSON.stringify(rem)) {
    const newIds = nextRem.map((store) => store.id);
    const oldIds = rem.map((store) => store.id);
    newIds.forEach((id) => {
      if (!oldIds.includes(id)) {
        idObject = nextRem.find((store) => store.id === id);
        console.log(
          `A store at ${idObject.address} is now avaliable (${idObject.coach_url})`
        );
        beep(5);
      }
    });
  }
}, 1000);
