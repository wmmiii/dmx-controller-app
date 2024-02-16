package main

import (
	"archive/tar"
	"bytes"
	_ "embed"
	"flag"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path"
	"strings"
)

var (
	//go:embed package.tar
	package_tar []byte

	reloadScript = os.Getenv("IBAZEL_LIVERELOAD_URL")
)

func main() {
	var port int
	var serverCrt string
	var serverKey string

	// Read input flags
	flag.IntVar(&port, "port", 8080, "Specify which port to bind the server to.")
	flag.StringVar(&serverCrt, "server_crt", "server.crt", "Specify the TLS certificate to use for the server.")
	flag.StringVar(&serverKey, "server_key", "server.key", "Specify the TLS key to use for the server.")
	flag.Parse()

	// Create temporary directory
	temp, err := ioutil.TempDir("/tmp", "temp-")
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		os.RemoveAll(temp)
		log.Printf("Destroyed temp dir %s", temp)
	}()

	log.Printf("Created temp dir %s", temp)

	// Read embedded tar file into temporary directory
	tarReader := tar.NewReader(bytes.NewReader(package_tar))

	for {
		cur, err := tarReader.Next()
		if err == io.EOF {
			break
		} else if err != nil {
			log.Fatal(err)
		}
		filePath := path.Join(temp, cur.Name)
		if cur.Typeflag == tar.TypeDir {
			if err = os.MkdirAll(filePath, cur.FileInfo().Mode()); err != nil {
				log.Fatal(err)
			}
			continue
		} else if cur.Typeflag != tar.TypeReg {
			continue
		}
		data, err := io.ReadAll(tarReader)
		if err != nil {
			log.Fatal(err)
		}
		if err := os.WriteFile(filePath, data, 0o0666); err != nil {
			log.Fatal(err)
		}
	}

	// Serve files
	rootHandler, err := newRootHandler(temp)
	if err != nil {
		log.Fatal(err)
	}
	http.Handle("/", rootHandler)
	http.HandleFunc("/images/", imageHandler)

	log.Printf("Listening on :%d...\n", port)
	log.Println("Remember to add the following line into your /etc/hosts:")
	log.Println("127.0.0.1 dev.dmx-controller.app")
	log.Printf("Hosting at https://dev.dmx-controller.app:%d\n", port)
	err = http.ListenAndServeTLS(fmt.Sprintf(":%d", port), serverCrt, serverKey, nil)
	if err != nil {
		log.Fatal(err)
	}
}

type rootHandler struct {
	handler http.Handler
	index   string
	rootDir http.Dir
}

func (h *rootHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		w.Write([]byte(h.index))
	} else if _, err := h.rootDir.Open(r.URL.Path); err != nil {
		w.WriteHeader(404)
		w.Write([]byte(h.index))
	} else {
		h.handler.ServeHTTP(w, r)
	}
}

func newRootHandler(temp string) (http.Handler, error) {
	indexBytes, err := os.ReadFile(path.Join(temp, "index.html"))
	if err != nil {
		return nil, err
	}
	index := string(indexBytes[:])

	if reloadScript != "" {
		fmt.Println("Using iBazel for page reload!")
		index = strings.ReplaceAll(
			index,
			"<!-- Inject scripts here -->",
			fmt.Sprintf("<script src=\"%s\"></script>", reloadScript))
	}

	dir := http.Dir(temp)
	fs := http.FileServer(dir)
	return &rootHandler{
		handler: fs,
		index:   index,
		rootDir: dir,
	}, nil
}

// "Proxies" requests to the main website. This is useful for fetching images
// that were uploaded to the GCS bucket.
func imageHandler(w http.ResponseWriter, req *http.Request) {
	url := fmt.Sprintf("https://dmx-controller.app%s", req.URL.Path)

	resp, err := http.Get(url)
	if err != nil {
		log.Fatal(err)
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Fatal(err)
	}

	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}
