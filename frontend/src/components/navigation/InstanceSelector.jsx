import React, { useState } from 'react';
import { useInstance } from '../../contexts/InstanceContext';
import { ChevronDown, Check, Smartphone, Plus } from 'lucide-react';

const InstanceSelector = () => {
    const { instances, selectedInstance, changeInstance } = useInstance();
    const [isOpen, setIsOpen] = useState(false);

    if (!selectedInstance) return null;

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-wa-dark-hover w-full transition-colors border border-transparent hover:border-wa-border"
            >
                <div className="w-8 h-8 rounded-full bg-wa-green/20 flex items-center justify-center text-wa-green">
                    <Smartphone size={18} />
                </div>
                <div className="flex-1 text-left overflow-hidden">
                    <div className="text-sm font-medium text-wa-text-primary truncate">{selectedInstance.name}</div>
                    <div className="text-xs text-wa-text-secondary capitalize truncate">{selectedInstance.status || 'Desconectado'}</div>
                </div>
                <ChevronDown size={16} className={`text-wa-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute top-full left-0 w-full mt-2 bg-wa-dark-paper border border-wa-border rounded-lg shadow-xl z-50 overflow-hidden">
                        <div className="max-h-60 overflow-y-auto">
                            {instances.map(instance => (
                                <button
                                    key={instance.id}
                                    onClick={() => {
                                        changeInstance(instance.id);
                                        setIsOpen(false);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-dark-hover transition-colors text-left"
                                >
                                    <div className={`w-2 h-2 rounded-full ${instance.status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <span className="flex-1 text-wa-text-primary text-sm truncate">{instance.name}</span>
                                    {selectedInstance.id === instance.id && <Check size={16} className="text-wa-green" />}
                                </button>
                            ))}
                        </div>
                        {/* Future: Add button to create new instance */}
                        {/* <div className="border-t border-wa-border p-2">
                <button className="w-full flex items-center justify-center gap-2 text-xs text-wa-text-secondary hover:text-wa-green py-2 hover:bg-wa-dark-hover rounded">
                    <Plus size={14} />
                    Nova Instância
                </button>
            </div> */}
                    </div>
                </>
            )}
        </div>
    );
};

export default InstanceSelector;
