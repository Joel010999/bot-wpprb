const fs = require('fs');

async function testPost() {
  try {
    const res = await fetch("http://localhost:3000/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    fs.writeFileSync("error.html", text);
    console.log("Saved to error.html");
  } catch (err) {
    console.error(err);
  }
}

testPost();
