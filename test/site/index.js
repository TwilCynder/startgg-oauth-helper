const res = await fetch("/token");
const resBody = await res.text();

const element = document.querySelector(".response");
element.classList.add(res.ok ? "green" : "red");
element.innerHTML = res.status + " : " + (resBody ?? "");

console.log(res);