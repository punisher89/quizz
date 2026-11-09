// QuizShow-Live-2-Test: a self-contained launcher for the offline HTML5 game.
// On Windows it opens a dedicated Edge/Chrome app window whenever available.
package main

import (
    "embed"
    "flag"
    "fmt"
    "io/fs"
    "log"
    "net"
    "net/http"
    "os"
    "os/exec"
    "path/filepath"
    "runtime"
    "sync/atomic"
    "time"
)

//go:embed index.html styles.css styles-live2.css src/*.js assets/*
var content embed.FS

func findBrowser() string {
    candidates := []string{}
    if runtime.GOOS == "windows" {
        for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")} {
            if base != "" {
                candidates = append(candidates, filepath.Join(base,"Microsoft","Edge","Application","msedge.exe"))
                candidates = append(candidates, filepath.Join(base,"Google","Chrome","Application","chrome.exe"))
            }
        }
    }
    for _, file := range candidates {
        if info, err := os.Stat(file); err == nil && !info.IsDir() { return file }
    }
    return ""
}

func openAppWindow(url string) {
    browser := findBrowser()
    if browser != "" {
        local := os.Getenv("LOCALAPPDATA")
        if local == "" { local = os.TempDir() }
        profile := filepath.Join(local, "QuizShow-Live-2-Test", "browser-profile")
        _ = os.MkdirAll(profile, 0700)
        cmd := exec.Command(browser, "--app="+url, "--user-data-dir="+profile, "--no-first-run", "--no-default-browser-check")
        if cmd.Start() == nil {
            // Dedicated app instance exits when its window is closed.
            _ = cmd.Wait()
            os.Exit(0)
        }
    }
    if runtime.GOOS == "windows" {
        _ = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url).Start()
    } else {
        _ = exec.Command("xdg-open", url).Start()
    }
    // For browsers without app-window mode, automatically exit the launcher
    // if the local page has not made any requests for a while.
}

func main() {
    noBrowser := flag.Bool("no-browser",false,"run an offline HTTP server without launching a browser")
    flag.Parse()
    webFS, err := fs.Sub(content,".")
    if err != nil { log.Fatal(err) }
    listener, err := net.Listen("tcp", "127.0.0.1:0")
    if err != nil { log.Fatal("Cannot start localhost game: ",err) }
    url := fmt.Sprintf("http://127.0.0.1:%d/",listener.Addr().(*net.TCPAddr).Port)
    var lastAccess atomic.Int64
    lastAccess.Store(time.Now().Unix())
    mux := http.NewServeMux()
    mux.HandleFunc("/__heartbeat",func(w http.ResponseWriter,r *http.Request){
        lastAccess.Store(time.Now().Unix())
        w.WriteHeader(http.StatusNoContent)
    })
    files := http.FileServer(http.FS(webFS))
    mux.HandleFunc("/",func(w http.ResponseWriter,r *http.Request){
        lastAccess.Store(time.Now().Unix())
        w.Header().Set("X-Content-Type-Options","nosniff")
        w.Header().Set("Cache-Control","no-store")
        files.ServeHTTP(w,r)
    })
    go func() {
        ticker := time.NewTicker(30 * time.Second)
        defer ticker.Stop()
        for range ticker.C {
            if !*noBrowser && time.Since(time.Unix(lastAccess.Load(),0)) > 2*time.Minute { os.Exit(0) }
        }
    }()
    if *noBrowser {
        fmt.Println(url)
    } else {
        go openAppWindow(url)
    }
    if err := http.Serve(listener,mux); err != nil { log.Fatal(err) }
}
