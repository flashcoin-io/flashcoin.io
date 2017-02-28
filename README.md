The project use JSPM(v0.17 beta) to manage packages and use local-web-server to host local web pages.

Let run steps in below:

1. $ npm install
  - This command will install relevant packages, including jspm package version(v0.17-beta)
2. $ jspm install
  - JSPM will install all packages that are defined in the config file.
3. $ npm install -g local-web-server
  - This command will install a simple web server to host local web pages.

To run dev mode:

4. $ ws
  - Start local web server at default port(8000)
  - Open link http://localhost:8000 to test.

To run deploy mode:

4. $ gulp
5. public$ ws