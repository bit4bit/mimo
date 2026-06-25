(ns mimo-platform.system
  (:require [com.stuartsierra.component :as component]
            mimo-platform.pedestal
            mimo-platform.mimo))

(defn new-system []
  (component/system-map

   :mimo
   (mimo-platform.mimo/new-mimo)

   :components
   (component/using {} [:mimo])

   :pedestal
   (component/using
    (mimo-platform.pedestal/new-pedestal)
    [:components :mimo])))
