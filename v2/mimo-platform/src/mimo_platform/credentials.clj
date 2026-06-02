(ns mimo-platform.credentials
  (:require [clj-yaml.core :as yaml]
            [clojure.java.io :as io]
            [buddy.sign.jwt :as jwt])
  (:import [org.mindrot.jbcrypt BCrypt]
           [java.time Instant Duration]))

(defn make-credentials [username & {:keys [mimo-dir]}]
  {:username username :mimo-dir mimo-dir})

(defn- load-credentials-meta [{:keys [username mimo-dir]}]
  "Read credentials for USERNAME"
  (let [credentials-path (format "%s/users/%s/credentials.yaml" mimo-dir username)
        credentials-content (slurp (io/file credentials-path))
        credentials (yaml/parse-string credentials-content)]
    credentials))


(defn verify-password? [credentials password]
  (try
    (let [credentials-meta (load-credentials-meta credentials)
          password-hash (get credentials-meta :passwordHash)
          normalized-password-hash (clojure.string/replace password-hash #"^\$2b\$" (fn [_] "$2a$"))
          ]
      (BCrypt/checkpw password normalized-password-hash))
    (catch Exception e
      (println "Invalid credentials due: " (.getMessage e))
      false)))

(defn generate-token [credentials password secret]
  (when (verify-password? credentials password)
    (let [exp (-> (Instant/now)
                  (.plus (Duration/ofDays 7))
                  (.getEpochSecond))]
      (jwt/sign {:sub (:username credentials) :exp exp} secret {:alg :hs256}))))
