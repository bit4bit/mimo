(ns mimo-platform.pedestal
  (:require [com.stuartsierra.component :as component]
            [io.pedestal.connector :as conn]
            [io.pedestal.http.http-kit :as hk]
            mimo-platform.routes))

(defn- inject-components
  [components]
  {:name ::inject-components
   :enter #(assoc-in % [:request :components] components)})

(defrecord Pedestal [components mimo connector]
  component/Lifecycle

  ; how to remove redudant mimo [:mimo ..]??
  (start [this]
    (let [http-port (get-in mimo [:mimo :http-port])
          listen-host (get-in mimo [:mimo :listen-host])]
      (assoc this :connector
             (-> (conn/default-connector-map http-port)
                 (assoc :host listen-host)
                 (conn/with-interceptor (inject-components components))
                 (conn/optionally-with-dev-mode-interceptors)
                 (conn/with-default-interceptors)
                 (conn/with-routes (mimo-platform.routes/routes {:mimo mimo}))
                 (hk/create-connector nil)
                 (conn/start!)))))
  (stop [this]
    (conn/stop! connector)
    (assoc this :connector nil)))


(defn new-pedestal []
  (map->Pedestal {}))
