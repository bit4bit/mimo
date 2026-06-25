(ns mimo-platform.mimo
  (:require [com.stuartsierra.component :as component]))

(defn make-mimo [& {:keys [mimo-dir jwt-secret http-port listen-host]}]
  {:mimo-dir mimo-dir
   :jwt-secret jwt-secret
   :http-port http-port
   :listen-host listen-host})

(defn parse-port [value default]
  (if value
    (Integer/parseInt value)
    default))

(defrecord Mimo []
  component/Lifecycle

  (start [this]
    (let [mimo-ctx (make-mimo
                 :http-port (parse-port (System/getenv "PORT") 8890)
                 :listen-host (or (System/getenv "MIMO_LISTEN_HOST") "0.0.0.0")
                 :mimo-dir (or (System/getenv "MIMO_HOME") "/home/app/.mimo")
                 :jwt-secret (or (System/getenv "JWT_SECRET") "secret"))]
      (assoc this :mimo mimo-ctx)))

  (stop [this]
    (assoc this :mimo nil))
  )

(defn new-mimo
  []
  (map->Mimo {}))
