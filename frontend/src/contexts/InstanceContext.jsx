import React, { createContext, useContext, useState, useEffect } from 'react';
import { instanceService } from '../services/instance.service';

const InstanceContext = createContext(null);

export const useInstance = () => {
    const context = useContext(InstanceContext);
    if (!context) {
        throw new Error('useInstance deve ser usado dentro de InstanceProvider');
    }
    return context;
};

export const InstanceProvider = ({ children }) => {
    const [instances, setInstances] = useState([]);
    const [selectedInstance, setSelectedInstance] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load instances
    useEffect(() => {
        const fetchInstances = async () => {
            try {
                const data = await instanceService.listInstances();
                setInstances(data);

                // Restore selection or default to first
                const savedId = localStorage.getItem('selected_instance_id');
                if (savedId && data.find(i => i.id === savedId)) {
                    setSelectedInstance(data.find(i => i.id === savedId));
                } else if (data.length > 0) {
                    setSelectedInstance(data[0]);
                }
            } catch (error) {
                console.error('Failed to fetch instances', error);
            } finally {
                setLoading(false);
            }
        };
        fetchInstances();
    }, []);

    // Update Axios header when selection changes
    useEffect(() => {
        if (selectedInstance) {
            instanceService.setInstanceId(selectedInstance.id);
            localStorage.setItem('selected_instance_id', selectedInstance.id);
        } else {
            instanceService.setInstanceId(null);
            localStorage.removeItem('selected_instance_id');
        }
    }, [selectedInstance]);

    const changeInstance = (instanceId) => {
        const instance = instances.find(i => i.id === instanceId);
        if (instance) {
            setSelectedInstance(instance);
            // We reload the page to ensure all data is refreshed cleanly
            // This mimics a "workspace switch" experience
            window.location.reload();
        }
    };

    return (
        <InstanceContext.Provider value={{ instances, selectedInstance, changeInstance, loading }}>
            {children}
        </InstanceContext.Provider>
    );
};
